import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { publishRealtimeEvent } from "../../realtime/bus.js";
import { realtimeEvents } from "../../realtime/events.js";
import { AppError } from "../../shared/app-error.js";
import { buildPaginatedResponse, getPagination } from "../../shared/pagination.js";
import type { Actor } from "../auth/actor.js";
import { previewInventoryImport } from "./inventory-import.preview.js";
import type {
  InventoryImportExecuteInput,
  InventoryImportListQuery,
  InventoryImportPresetCreateInput,
  InventoryImportPreviewInput
} from "./inventory-import.schemas.js";
import type { ImportPreviewRow } from "./inventory-import.types.js";
import { restoreProductData, type ProductImportSnapshot, writeImportRow } from "./inventory-import.write.js";

function requireStoreId(actor: Actor) {
  if (!actor.storeId) throw new AppError(400, "STORE_REQUIRED", "Inventory imports require a store.");
  return actor.storeId;
}

function jsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function getImportSettings(storeId: string) {
  const setting = await prisma.setting.findUnique({ where: { storeId_key: { storeId, key: "inventoryImport" } }, select: { value: true } });
  const value = setting?.value && typeof setting.value === "object" && !Array.isArray(setting.value) ? (setting.value as Record<string, unknown>) : {};
  const rawBatchSize = Number(value.batchSize ?? 250);
  return {
    batchSize: Number.isInteger(rawBatchSize) ? Math.min(1000, Math.max(25, rawBatchSize)) : 250,
    preventDuplicateFiles: value.preventDuplicateFiles !== false
  };
}

function skippedRowData(batchId: string, row: ImportPreviewRow) {
  return {
    batchId,
    rowNumber: row.rowNumber,
    productId: row.matchedProduct?.id,
    action: row.action,
    status: row.action === "INVALID" ? "INVALID" : row.action === "REVIEW" ? "REVIEW" : "SKIPPED",
    matchMethod: row.matchMethod,
    previousStock: row.previousStock,
    newStock: row.previousStock,
    quantityChanged: 0,
    warnings: jsonValue(row.warnings),
    errors: jsonValue(row.errors)
  } satisfies Prisma.InventoryImportRowCreateManyInput;
}

async function persistNonExecutableRows(batchId: string, rows: ImportPreviewRow[]) {
  for (const group of chunks(rows, 500)) {
    await prisma.inventoryImportRow.createMany({ data: group.map((row) => skippedRowData(batchId, row)) });
  }
}

async function persistFailedRow(batchId: string, row: ImportPreviewRow, error: unknown) {
  const message = error instanceof Error ? error.message : "The row could not be imported.";
  await prisma.inventoryImportRow.create({
    data: {
      batchId,
      rowNumber: row.rowNumber,
      productId: row.matchedProduct?.id,
      action: row.action,
      status: "FAILED",
      matchMethod: row.matchMethod,
      previousStock: row.previousStock,
      newStock: row.previousStock,
      quantityChanged: 0,
      warnings: jsonValue(row.warnings),
      errors: jsonValue([...row.errors, message])
    }
  });
}

export async function previewImport(input: InventoryImportPreviewInput, actor: Actor) {
  return previewInventoryImport(input, actor);
}

export async function executeImport(input: InventoryImportExecuteInput, actor: Actor) {
  const startedAt = Date.now();
  const storeId = requireStoreId(actor);
  const preview = await previewInventoryImport(input, actor);
  if (preview.fingerprint !== input.previewFingerprint) {
    throw new AppError(409, "IMPORT_PREVIEW_STALE", "The import rows changed after preview. Preview the import again before confirming.");
  }

  const settings = await getImportSettings(storeId);
  if (settings.preventDuplicateFiles && preview.duplicateBatch) {
    throw new AppError(409, "DUPLICATE_IMPORT", `This import was already completed as batch ${preview.duplicateBatch.id}.`);
  }

  const warehouseIds = (
    await prisma.warehouse.findMany({ where: { storeId, deletedAt: null }, orderBy: { code: "asc" }, select: { id: true } })
  ).map((warehouse) => warehouse.id);
  const batch = await prisma.inventoryImportBatch.create({
    data: {
      storeId,
      warehouseId: preview.warehouse.id,
      createdByUserId: actor.userId,
      mode: input.mode,
      sourceName: input.source.name,
      sourceSizeBytes: input.source.sizeBytes,
      fingerprint: preview.fingerprint,
      rowCount: preview.summary.rowCount,
      validCount: preview.summary.validCount,
      warningCount: preview.summary.warningCount,
      invalidCount: preview.summary.invalidCount,
      summary: jsonValue(preview.summary)
    }
  });

  const executableRows = preview.rows.filter((row) => ["CREATE", "UPDATE", "STOCK"].includes(row.action) && row.status !== "INVALID");
  const nonExecutableRows = preview.rows.filter((row) => !executableRows.includes(row));
  await persistNonExecutableRows(batch.id, nonExecutableRows);

  for (const group of chunks(executableRows, settings.batchSize)) {
    try {
      await prisma.$transaction(async (transaction) => {
        for (const row of group) {
          await writeImportRow(transaction, {
            batchId: batch.id,
            mode: input.mode,
            row,
            warehouseId: preview.warehouse.id,
            warehouseIds,
            actorId: actor.userId
          });
        }
      });
    } catch {
      for (const row of group) {
        try {
          await prisma.$transaction((transaction) =>
            writeImportRow(transaction, {
              batchId: batch.id,
              mode: input.mode,
              row,
              warehouseId: preview.warehouse.id,
              warehouseIds,
              actorId: actor.userId
            })
          );
        } catch (error) {
          await persistFailedRow(batch.id, row, error);
        }
      }
    }
  }

  const results = await prisma.inventoryImportRow.findMany({ where: { batchId: batch.id }, select: { action: true, status: true, quantityChanged: true } });
  const successful = results.filter((row) => row.status === "SUCCESS");
  const createdCount = successful.filter((row) => row.action === "CREATE").length;
  const updatedCount = successful.filter((row) => row.action === "UPDATE").length;
  const failedCount = results.filter((row) => row.status === "FAILED" || row.status === "INVALID").length;
  const skippedCount = results.filter((row) => ["SKIPPED", "REVIEW"].includes(row.status)).length;
  const stockDelta = successful.reduce((sum, row) => sum + Number(row.quantityChanged ?? 0), 0);
  const status = successful.length === 0 && failedCount > 0 ? "FAILED" : failedCount > 0 || skippedCount > 0 ? "PARTIAL" : "COMPLETED";
  const completed = await prisma.inventoryImportBatch.update({
    where: { id: batch.id },
    data: {
      status,
      createdCount,
      updatedCount,
      skippedCount,
      failedCount,
      stockDelta,
      durationMs: Date.now() - startedAt,
      completedAt: new Date(),
      summary: jsonValue({ ...preview.summary, createdCount, updatedCount, skippedCount, failedCount, stockDelta })
    }
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.userId,
      action: "INVENTORY_IMPORT_COMPLETED",
      entityType: "InventoryImportBatch",
      entityId: batch.id,
      metadata: { mode: input.mode, sourceName: input.source.name, status, createdCount, updatedCount, skippedCount, failedCount, stockDelta }
    }
  });
  publishRealtimeEvent(realtimeEvents.inventoryAdjusted, {
    entityId: batch.id,
    actorId: actor.userId,
    storeId,
    occurredAt: new Date().toISOString()
  });

  return getImportBatch(completed.id, actor);
}

export async function listImportBatches(query: InventoryImportListQuery, actor: Actor) {
  const storeId = requireStoreId(actor);
  const { page, pageSize, skip, take } = getPagination(query);
  const where = { storeId, status: query.status };
  const [items, total] = await prisma.$transaction([
    prisma.inventoryImportBatch.findMany({
      where,
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        rolledBackBy: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: "desc" },
      skip,
      take
    }),
    prisma.inventoryImportBatch.count({ where })
  ]);
  return buildPaginatedResponse(items, total, page, pageSize);
}

export async function getImportBatch(batchId: string, actor: Actor) {
  const storeId = requireStoreId(actor);
  const batch = await prisma.inventoryImportBatch.findFirst({
    where: { id: batchId, storeId },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      rolledBackBy: { select: { id: true, name: true, email: true } },
      rows: {
        include: { product: { select: { id: true, sku: true, name: true, variant: true } } },
        orderBy: { rowNumber: "asc" }
      }
    }
  });
  if (!batch) throw new AppError(404, "IMPORT_BATCH_NOT_FOUND", "The inventory import batch was not found.");
  return batch;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function getImportReport(batchId: string, actor: Actor) {
  const batch = await getImportBatch(batchId, actor);
  const header = ["Row", "Status", "Action", "Product", "SKU", "Match", "Previous Stock", "New Stock", "Quantity Changed", "Warnings", "Errors"];
  const lines = batch.rows.map((row) =>
    [
      row.rowNumber,
      row.status,
      row.action,
      row.product?.name,
      row.product?.sku,
      row.matchMethod,
      row.previousStock,
      row.newStock,
      row.quantityChanged,
      Array.isArray(row.warnings) ? row.warnings.join("; ") : "",
      Array.isArray(row.errors) ? row.errors.join("; ") : ""
    ]
      .map(csvCell)
      .join(",")
  );
  return [`# Inventory Import ${batch.id}`, `# Source: ${batch.sourceName}`, header.map(csvCell).join(","), ...lines].join("\r\n");
}

function readSnapshot(value: Prisma.JsonValue | null): ProductImportSnapshot | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as unknown as ProductImportSnapshot) : null;
}

export async function rollbackImport(batchId: string, actor: Actor) {
  const storeId = requireStoreId(actor);
  const batch = await prisma.inventoryImportBatch.findFirst({
    where: { id: batchId, storeId },
    include: { rows: { where: { status: "SUCCESS" }, orderBy: { rowNumber: "desc" } } }
  });
  if (!batch) throw new AppError(404, "IMPORT_BATCH_NOT_FOUND", "The inventory import batch was not found.");
  if (!batch.completedAt || !["COMPLETED", "PARTIAL"].includes(batch.status)) {
    throw new AppError(409, "IMPORT_NOT_ROLLBACKABLE", "Only completed or partially completed imports can be rolled back.");
  }

  for (const row of batch.rows) {
    if (row.inventoryMovementId && row.productId) {
      const latestMovement = await prisma.inventoryMovement.findFirst({
        where: { productId: row.productId, warehouseId: batch.warehouseId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true }
      });
      if (latestMovement?.id !== row.inventoryMovementId) {
        throw new AppError(409, "IMPORT_ROLLBACK_UNSAFE", `Row ${row.rowNumber} cannot be rolled back because later stock activity exists.`);
      }
    }
    if (row.action === "CREATE" && row.productId) {
      const dependentRecords = await Promise.all([
        prisma.saleItem.count({ where: { productId: row.productId } }),
        prisma.heldSaleItem.count({ where: { productId: row.productId } }),
        prisma.refundItem.count({ where: { productId: row.productId } }),
        prisma.purchaseOrderItem.count({ where: { productId: row.productId } })
      ]);
      if (dependentRecords.some((count) => count > 0)) {
        throw new AppError(409, "IMPORT_ROLLBACK_UNSAFE", `Row ${row.rowNumber} created a product that is now used by another transaction.`);
      }
    }
    if ((row.action === "CREATE" || row.action === "UPDATE") && row.productId) {
      const current = await prisma.product.findUnique({ where: { id: row.productId }, select: { updatedAt: true } });
      const imported = readSnapshot(row.newProduct);
      if (!current || !imported || current.updatedAt.toISOString() !== imported.updatedAt) {
        throw new AppError(409, "IMPORT_ROLLBACK_UNSAFE", `Row ${row.rowNumber} cannot be rolled back because its product changed after import.`);
      }
    }
  }

  await prisma.$transaction(async (transaction) => {
    for (const row of batch.rows) {
      if (!row.productId) continue;
      const quantityChanged = Number(row.quantityChanged ?? 0);
      if (quantityChanged !== 0) {
        const stock = await transaction.inventoryStock.findUniqueOrThrow({
          where: { productId_warehouseId: { productId: row.productId, warehouseId: batch.warehouseId } }
        });
        const expectedStock = Number(row.newStock ?? 0);
        if (Number(stock.quantity) !== expectedStock) {
          throw new AppError(409, "IMPORT_ROLLBACK_UNSAFE", `Row ${row.rowNumber} stock no longer matches the imported balance.`);
        }
        const restoredStock = Number(row.previousStock ?? 0);
        await transaction.inventoryStock.update({ where: { id: stock.id }, data: { quantity: restoredStock } });
        await transaction.inventoryMovement.create({
          data: {
            productId: row.productId,
            warehouseId: batch.warehouseId,
            type: "IMPORT_ROLLBACK",
            quantity: -quantityChanged,
            referenceType: "INVENTORY_IMPORT_ROLLBACK",
            referenceId: batch.id,
            reason: `Rollback of import row ${row.rowNumber}`,
            createdByUserId: actor.userId
          }
        });
      }

      if (row.action === "CREATE") {
        await transaction.product.update({ where: { id: row.productId }, data: { status: "INACTIVE", deletedAt: new Date() } });
      } else if (row.action === "UPDATE") {
        const previous = readSnapshot(row.previousProduct);
        if (!previous) throw new AppError(409, "IMPORT_ROLLBACK_UNSAFE", `Row ${row.rowNumber} is missing its previous product state.`);
        await transaction.product.update({ where: { id: row.productId }, data: restoreProductData(previous) });
      }
      await transaction.inventoryImportRow.update({ where: { id: row.id }, data: { status: "ROLLED_BACK" } });
    }

    await transaction.inventoryImportBatch.update({
      where: { id: batch.id },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date(), rolledBackByUserId: actor.userId }
    });
    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "INVENTORY_IMPORT_ROLLED_BACK",
        entityType: "InventoryImportBatch",
        entityId: batch.id,
        metadata: { sourceName: batch.sourceName, rowCount: batch.rows.length }
      }
    });
  });

  publishRealtimeEvent(realtimeEvents.inventoryAdjusted, {
    entityId: batch.id,
    actorId: actor.userId,
    storeId,
    occurredAt: new Date().toISOString()
  });
  return getImportBatch(batch.id, actor);
}

export async function listImportPresets(actor: Actor) {
  const storeId = requireStoreId(actor);
  return prisma.inventoryImportPreset.findMany({
    where: { storeId, deletedAt: null },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: [{ name: "asc" }, { createdAt: "desc" }]
  });
}

export async function createImportPreset(input: InventoryImportPresetCreateInput, actor: Actor) {
  const storeId = requireStoreId(actor);
  const existing = await prisma.inventoryImportPreset.findMany({ where: { storeId, deletedAt: null }, select: { name: true } });
  if (existing.some((preset) => preset.name.localeCompare(input.name, undefined, { sensitivity: "accent" }) === 0)) {
    throw new AppError(409, "IMPORT_PRESET_EXISTS", "A mapping preset with this name already exists.");
  }
  return prisma.inventoryImportPreset.create({
    data: { storeId, createdByUserId: actor.userId, name: input.name, mapping: input.mapping }
  });
}

export async function deleteImportPreset(presetId: string, actor: Actor) {
  const storeId = requireStoreId(actor);
  const preset = await prisma.inventoryImportPreset.findFirst({ where: { id: presetId, storeId, deletedAt: null }, select: { id: true } });
  if (!preset) throw new AppError(404, "IMPORT_PRESET_NOT_FOUND", "The mapping preset was not found.");
  await prisma.inventoryImportPreset.update({ where: { id: preset.id }, data: { deletedAt: new Date() } });
  return { success: true };
}
