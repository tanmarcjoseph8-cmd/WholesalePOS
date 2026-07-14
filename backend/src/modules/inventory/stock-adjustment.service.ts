import { prisma } from "../../config/prisma.js";
import { publishRealtimeEvent } from "../../realtime/bus.js";
import { realtimeEvents } from "../../realtime/events.js";
import type { Actor } from "../auth/actor.js";
import { calculateAdjustmentDelta } from "./inventory-calculations.js";
import type { InventoryCountAdjustmentInput } from "./inventory.schemas.js";
import { assertProductAndWarehouse, stockInclude, toNumber } from "./inventory-stock.shared.js";

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
