import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { publishRealtimeEvent } from "../../realtime/bus.js";
import { realtimeEvents } from "../../realtime/events.js";
import { buildPaginatedResponse, getPagination } from "../../shared/pagination.js";
import type { Actor } from "../auth/actor.js";
import { calculateNextStock } from "./inventory-calculations.js";
import type { InventoryMovementCreateInput, MovementListQuery } from "./inventory.schemas.js";
import { assertProductAndWarehouse, stockInclude, toNumber } from "./inventory-stock.shared.js";

function movementEffect(type: InventoryMovementCreateInput["type"]) {
  if (type === "STOCK_IN" || type === "RETURN" || type === "PURCHASE_RECEIPT") {
    return "INCREASE" as const;
  }

  return "DECREASE" as const;
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
