import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { publishRealtimeEvent } from "../../realtime/bus.js";
import { realtimeEvents } from "../../realtime/events.js";
import { AppError } from "../../shared/app-error.js";
import { buildPaginatedResponse, getPagination } from "../../shared/pagination.js";
import type { Actor } from "../auth/actor.js";
import { calculateAdjustmentDelta, calculateNextStock } from "./inventory-calculations.js";
import type {
  InventoryCountAdjustmentInput,
  InventoryListQuery,
  InventoryMovementCreateInput,
  InventoryTransferInput,
  MovementListQuery
} from "./inventory.schemas.js";

const stockInclude = {
  product: { select: { id: true, sku: true, name: true, minimumStock: true, inventoryUnit: true } },
  warehouse: { select: { id: true, name: true, code: true, storeId: true } }
} satisfies Prisma.InventoryStockInclude;

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function movementEffect(type: InventoryMovementCreateInput["type"]) {
  if (type === "STOCK_IN" || type === "RETURN" || type === "PURCHASE_RECEIPT") {
    return "INCREASE" as const;
  }

  return "DECREASE" as const;
}

async function assertProductAndWarehouse(productId: string, warehouseId: string) {
  const [product, warehouse] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true, name: true } }),
    prisma.warehouse.findFirst({ where: { id: warehouseId, deletedAt: null }, select: { id: true, storeId: true } })
  ]);

  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
  }

  if (!warehouse) {
    throw new AppError(404, "WAREHOUSE_NOT_FOUND", "Warehouse was not found.");
  }

  return { product, warehouse };
}

export async function listStock(query: InventoryListQuery) {
  const { page, pageSize, skip, take } = getPagination(query);
  const where: Prisma.InventoryStockWhereInput = {
    productId: query.productId,
    warehouseId: query.warehouseId,
    ...(query.search
      ? {
          product: {
            OR: [
              { name: { contains: query.search } },
              { sku: { contains: query.search } },
              { barcodes: { some: { value: { contains: query.search } } } }
            ]
          }
        }
      : {})
  };

  if (query.lowStockOnly) {
    const rows = await prisma.inventoryStock.findMany({
      where,
      include: stockInclude,
      orderBy: [{ product: { name: "asc" } }, { warehouse: { code: "asc" } }]
    });
    const lowStockRows = rows.filter((row) => toNumber(row.quantity) <= toNumber(row.product.minimumStock));
    return buildPaginatedResponse(lowStockRows.slice(skip, skip + take), lowStockRows.length, page, pageSize);
  }

  const [items, total] = await prisma.$transaction([
    prisma.inventoryStock.findMany({
      where,
      include: stockInclude,
      orderBy: [{ product: { name: "asc" } }, { warehouse: { code: "asc" } }],
      skip,
      take
    }),
    prisma.inventoryStock.count({ where })
  ]);

  return buildPaginatedResponse(items, total, page, pageSize);
}

export async function listMovements(query: MovementListQuery) {
  const { page, pageSize, skip, take } = getPagination(query);
  const where: Prisma.InventoryMovementWhereInput = {
    productId: query.productId,
    warehouseId: query.warehouseId,
    type: query.type
  };

  const [items, total] = await prisma.$transaction([
    prisma.inventoryMovement.findMany({
      where,
      include: {
        product: { select: { id: true, sku: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: "desc" },
      skip,
      take
    }),
    prisma.inventoryMovement.count({ where })
  ]);

  return buildPaginatedResponse(items, total, page, pageSize);
}

export async function createInventoryMovement(input: InventoryMovementCreateInput, actor: Actor) {
  const { warehouse } = await assertProductAndWarehouse(input.productId, input.warehouseId);
  const effect = movementEffect(input.type);

  const result = await prisma.$transaction(async (transaction) => {
    const existingStock = await transaction.inventoryStock.upsert({
      where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } },
      update: {},
      create: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: 0
      }
    });

    const nextQuantity = calculateNextStock(toNumber(existingStock.quantity), input.quantity, effect);
    const [stock, movement] = await Promise.all([
      transaction.inventoryStock.update({
        where: { id: existingStock.id },
        data: { quantity: nextQuantity },
        include: stockInclude
      }),
      transaction.inventoryMovement.create({
        data: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          type: input.type,
          quantity: input.quantity,
          unitCost: input.unitCost,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          reason: input.reason,
          createdByUserId: actor.userId
        }
      })
    ]);

    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "INVENTORY_MOVEMENT_CREATED",
        entityType: "InventoryMovement",
        entityId: movement.id,
        metadata: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          type: input.type,
          quantity: input.quantity,
          previousQuantity: toNumber(existingStock.quantity),
          nextQuantity
        }
      }
    });

    return { stock, movement };
  });

  publishRealtimeEvent(realtimeEvents.inventoryAdjusted, {
    entityId: result.movement.id,
    actorId: actor.userId,
    storeId: warehouse.storeId,
    occurredAt: new Date().toISOString()
  });

  return result;
}

export async function adjustInventoryCount(input: InventoryCountAdjustmentInput, actor: Actor) {
  const { warehouse } = await assertProductAndWarehouse(input.productId, input.warehouseId);

  const result = await prisma.$transaction(async (transaction) => {
    const existingStock = await transaction.inventoryStock.upsert({
      where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } },
      update: {},
      create: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: 0
      }
    });

    const previousQuantity = toNumber(existingStock.quantity);
    const delta = calculateAdjustmentDelta(previousQuantity, input.countedQuantity);
    const [stock, movement] = await Promise.all([
      transaction.inventoryStock.update({
        where: { id: existingStock.id },
        data: { quantity: input.countedQuantity },
        include: stockInclude
      }),
      transaction.inventoryMovement.create({
        data: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          type: "ADJUSTMENT",
          quantity: delta,
          reason: input.reason,
          createdByUserId: actor.userId
        }
      })
    ]);

    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "INVENTORY_COUNT_ADJUSTED",
        entityType: "InventoryMovement",
        entityId: movement.id,
        metadata: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          previousQuantity,
          countedQuantity: input.countedQuantity,
          delta
        }
      }
    });

    return { stock, movement };
  });

  publishRealtimeEvent(realtimeEvents.inventoryAdjusted, {
    entityId: result.movement.id,
    actorId: actor.userId,
    storeId: warehouse.storeId,
    occurredAt: new Date().toISOString()
  });

  return result;
}

export async function transferInventory(input: InventoryTransferInput, actor: Actor) {
  const from = await assertProductAndWarehouse(input.productId, input.fromWarehouseId);
  const to = await assertProductAndWarehouse(input.productId, input.toWarehouseId);
  const transferReferenceId = crypto.randomUUID();

  const result = await prisma.$transaction(async (transaction) => {
    const [fromStock, toStock] = await Promise.all([
      transaction.inventoryStock.upsert({
        where: { productId_warehouseId: { productId: input.productId, warehouseId: input.fromWarehouseId } },
        update: {},
        create: { productId: input.productId, warehouseId: input.fromWarehouseId, quantity: 0 }
      }),
      transaction.inventoryStock.upsert({
        where: { productId_warehouseId: { productId: input.productId, warehouseId: input.toWarehouseId } },
        update: {},
        create: { productId: input.productId, warehouseId: input.toWarehouseId, quantity: 0 }
      })
    ]);

    const nextFromQuantity = calculateNextStock(toNumber(fromStock.quantity), input.quantity, "DECREASE");
    const nextToQuantity = calculateNextStock(toNumber(toStock.quantity), input.quantity, "INCREASE");

    const [updatedFromStock, updatedToStock, outMovement, inMovement] = await Promise.all([
      transaction.inventoryStock.update({
        where: { id: fromStock.id },
        data: { quantity: nextFromQuantity },
        include: stockInclude
      }),
      transaction.inventoryStock.update({
        where: { id: toStock.id },
        data: { quantity: nextToQuantity },
        include: stockInclude
      }),
      transaction.inventoryMovement.create({
        data: {
          productId: input.productId,
          warehouseId: input.fromWarehouseId,
          type: "TRANSFER",
          quantity: -input.quantity,
          referenceType: "InventoryTransfer",
          referenceId: transferReferenceId,
          reason: input.reason,
          createdByUserId: actor.userId
        }
      }),
      transaction.inventoryMovement.create({
        data: {
          productId: input.productId,
          warehouseId: input.toWarehouseId,
          type: "TRANSFER",
          quantity: input.quantity,
          referenceType: "InventoryTransfer",
          referenceId: transferReferenceId,
          reason: input.reason,
          createdByUserId: actor.userId
        }
      })
    ]);

    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "INVENTORY_TRANSFERRED",
        entityType: "InventoryTransfer",
        entityId: transferReferenceId,
        metadata: {
          productId: input.productId,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          quantity: input.quantity
        }
      }
    });

    return { fromStock: updatedFromStock, toStock: updatedToStock, outMovement, inMovement, transferReferenceId };
  });

  for (const warehouse of [from.warehouse, to.warehouse]) {
    publishRealtimeEvent(realtimeEvents.inventoryAdjusted, {
      entityId: result.transferReferenceId,
      actorId: actor.userId,
      storeId: warehouse.storeId,
      occurredAt: new Date().toISOString()
    });
  }

  return result;
}
