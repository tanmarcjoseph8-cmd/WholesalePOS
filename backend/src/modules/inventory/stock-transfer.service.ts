import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { publishRealtimeEvent } from "../../realtime/bus.js";
import { realtimeEvents } from "../../realtime/events.js";
import type { Actor } from "../auth/actor.js";
import { calculateNextStock } from "./inventory-calculations.js";
import type { InventoryTransferInput } from "./inventory.schemas.js";
import { assertProductAndWarehouse, stockInclude, toNumber } from "./inventory-stock.shared.js";

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
