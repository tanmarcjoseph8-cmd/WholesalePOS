import type { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { publishRealtimeEvent } from "../../realtime/bus.js";
import { realtimeEvents } from "../../realtime/events.js";
import { AppError } from "../../shared/app-error.js";
import { buildPaginatedResponse, getPagination } from "../../shared/pagination.js";
import type { Actor } from "../auth/actor.js";
import { createInventoryMovement } from "../inventory/inventory.service.js";
import type { ProductCreateInput, ProductImportInput, ProductListQuery, ProductUpdateInput } from "./product.schemas.js";
import { findPriceChanges, type PriceFields } from "./product-pricing.js";

const productInclude = {
  barcodes: true,
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  stocks: {
    include: { warehouse: { select: { id: true, name: true, code: true, storeId: true } } },
    orderBy: [{ warehouse: { code: "asc" } }]
  }
} satisfies Prisma.ProductInclude;

function normalizeBarcodes(barcodes: ProductCreateInput["barcodes"]) {
  const seen = new Set<string>();
  const uniqueBarcodes = barcodes.map((barcode) => ({ ...barcode, value: barcode.value.trim() })).filter((barcode) => {
    const normalized = barcode.value.toLowerCase();
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });

  if (uniqueBarcodes.length > 0 && !uniqueBarcodes.some((barcode) => barcode.isPrimary)) {
    const [firstBarcode] = uniqueBarcodes;
    if (firstBarcode) {
      uniqueBarcodes[0] = { ...firstBarcode, isPrimary: true };
    }
  }

  return uniqueBarcodes;
}

function resolveSku(input: ProductCreateInput, barcodes: ReturnType<typeof normalizeBarcodes>) {
  if (input.sku?.trim()) {
    return input.sku.trim();
  }

  const primaryBarcode = barcodes.find((barcode) => barcode.isPrimary) ?? barcodes[0];
  if (primaryBarcode) {
    return primaryBarcode.value;
  }

  return `AUTO-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function toPriceFields(product: {
  costPrice: Prisma.Decimal | number;
  retailPrice: Prisma.Decimal | number;
  wholesalePrice: Prisma.Decimal | number;
  vipPrice: Prisma.Decimal | number;
}): PriceFields {
  return {
    costPrice: Number(product.costPrice),
    retailPrice: Number(product.retailPrice),
    wholesalePrice: Number(product.wholesalePrice),
    vipPrice: Number(product.vipPrice)
  };
}

async function assertRelations(input: { categoryId?: string | null; supplierId?: string | null }) {
  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, deletedAt: null }, select: { id: true } });
    if (!category) {
      throw new AppError(400, "CATEGORY_NOT_FOUND", "The selected category does not exist.");
    }
  }

  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null }, select: { id: true } });
    if (!supplier) {
      throw new AppError(400, "SUPPLIER_NOT_FOUND", "The selected supplier does not exist.");
    }
  }
}

export async function listProducts(query: ProductListQuery) {
  const { page, pageSize, skip, take } = getPagination(query);
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    status: query.status,
    categoryId: query.categoryId,
    supplierId: query.supplierId,
    salesChannel: query.salesChannel,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { variant: { contains: query.search } },
            { sku: { contains: query.search } },
            { brand: { contains: query.search } },
            { barcodes: { some: { value: { contains: query.search } } } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip,
      take
    }),
    prisma.product.count({ where })
  ]);

  return buildPaginatedResponse(items, total, page, pageSize);
}

export async function getProduct(productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    include: {
      ...productInclude,
      stocks: {
        include: { warehouse: { select: { id: true, name: true, code: true } } }
      },
      priceHistory: {
        orderBy: { changedAt: "desc" },
        take: 20
      }
    }
  });

  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
  }

  return product;
}

export async function createProduct(input: ProductCreateInput, actor: Actor) {
  await assertRelations(input);
  const barcodes = normalizeBarcodes(input.barcodes);
  const sku = resolveSku(input, barcodes);

  const product = await prisma.$transaction(async (transaction) => {
    const created = await transaction.product.create({
      data: {
        ...input,
        sku,
        barcodes: {
          create: barcodes
        }
      },
      include: productInclude
    });

    const warehouses = await transaction.warehouse.findMany({
      where: { deletedAt: null, storeId: actor.storeId ?? undefined },
      select: { id: true }
    });
    if (warehouses.length) {
      await transaction.inventoryStock.createMany({
        data: warehouses.map((warehouse) => ({
          productId: created.id,
          warehouseId: warehouse.id,
          quantity: 0
        }))
      });
    }

    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "PRODUCT_CREATED",
        entityType: "Product",
        entityId: created.id,
        metadata: { sku: created.sku, name: created.name }
      }
    });

    return transaction.product.findUniqueOrThrow({
      where: { id: created.id },
      include: productInclude
    });
  });

  publishRealtimeEvent(realtimeEvents.productCreated, {
    entityId: product.id,
    actorId: actor.userId,
    storeId: actor.storeId,
    occurredAt: new Date().toISOString()
  });

  return product;
}

export async function importProducts(input: ProductImportInput, actor: Actor) {
  const warehouse = input.warehouseId
    ? await prisma.warehouse.findFirst({ where: { id: input.warehouseId, deletedAt: null }, select: { id: true } })
    : await prisma.warehouse.findFirst({ where: { deletedAt: null, storeId: actor.storeId ?? undefined }, orderBy: { code: "asc" }, select: { id: true } });

  if (!warehouse) {
    throw new AppError(400, "WAREHOUSE_REQUIRED", "Create or select a warehouse before importing products.");
  }

  const created: Array<{ rowNumber: number; id: string; name: string; sku: string }> = [];
  const errors: Array<{ rowNumber: number; name: string; message: string }> = [];

  for (const [index, row] of input.rows.entries()) {
    const rowNumber = index + 2;
    const { initialStock, unitCost, ...productInput } = row;

    try {
      const product = await createProduct(productInput, actor);
      if (initialStock > 0) {
        await createInventoryMovement(
          {
            productId: product.id,
            warehouseId: warehouse.id,
            type: "STOCK_IN",
            quantity: initialStock,
            unitCost: unitCost ?? Number(product.costPrice),
            referenceType: "PRODUCT_IMPORT",
            referenceId: product.id,
            reason: "Initial stock from product import"
          },
          actor
        );
      }
      created.push({ rowNumber, id: product.id, name: product.name, sku: product.sku });
    } catch (error) {
      errors.push({ rowNumber, name: productInput.name, message: error instanceof Error ? error.message : "Product could not be imported." });
    }
  }

  return {
    createdCount: created.length,
    failedCount: errors.length,
    created,
    errors
  };
}

export async function updateProduct(productId: string, input: ProductUpdateInput, actor: Actor) {
  await assertRelations(input);

  const existing = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    include: { barcodes: true }
  });

  if (!existing) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
  }

  const priceChanges = findPriceChanges(toPriceFields(existing), input);
  const { barcodes, ...productData } = input;
  const normalizedBarcodes = barcodes ? normalizeBarcodes(barcodes) : undefined;

  const product = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.product.update({
      where: { id: productId },
      data: {
        ...productData,
        ...(normalizedBarcodes
          ? {
              barcodes: {
                deleteMany: {},
                create: normalizedBarcodes
              }
            }
          : {})
      },
      include: productInclude
    });

    if (priceChanges.length > 0) {
      await transaction.priceHistory.createMany({
        data: priceChanges.map((change) => ({
          productId,
          priceType: change.priceType,
          oldPrice: change.oldPrice,
          newPrice: change.newPrice,
          changedById: actor.userId
        }))
      });
    }

    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "PRODUCT_UPDATED",
        entityType: "Product",
        entityId: productId,
        metadata: {
          changedFields: Object.keys(input),
          priceChanges
        }
      }
    });

    return updated;
  });

  publishRealtimeEvent(priceChanges.length > 0 ? realtimeEvents.priceChanged : realtimeEvents.productUpdated, {
    entityId: product.id,
    actorId: actor.userId,
    storeId: actor.storeId,
    occurredAt: new Date().toISOString()
  });

  return product;
}

export async function deleteProduct(productId: string, actor: Actor) {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, sku: true, name: true }
  });

  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
  }

  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date(), status: "INACTIVE" }
    }),
    prisma.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "PRODUCT_DELETED",
        entityType: "Product",
        entityId: productId,
        metadata: { sku: product.sku, name: product.name }
      }
    })
  ]);

  publishRealtimeEvent(realtimeEvents.productUpdated, {
    entityId: productId,
    actorId: actor.userId,
    storeId: actor.storeId,
    occurredAt: new Date().toISOString()
  });

  return { success: true };
}
