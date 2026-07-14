import type { Prisma } from "@prisma/client";
import { AppError } from "../../shared/app-error.js";

export const reservationOrderStatuses = new Set(["CONFIRMED", "PREPARING", "READY", "SERVED"]);

type ReservableItem = {
  id: string;
  productId: string;
  warehouseId: string | null;
  baseQuantity: Prisma.Decimal | number;
};

type ReservationOrder = {
  id: string;
  storeId: string;
  status: string;
  orderNumber: string | null;
};

function key(productId: string, warehouseId: string) {
  return `${productId}:${warehouseId}`;
}

export async function releaseOrderReservations(
  transaction: Prisma.TransactionClient,
  orderId: string,
  actorId: string,
  reason: string
) {
  const released = await transaction.inventoryReservation.updateMany({
    where: { heldSaleId: orderId, status: "ACTIVE" },
    data: { status: "RELEASED", releasedAt: new Date(), reason }
  });
  if (released.count) {
    await transaction.auditLog.create({
      data: {
        actorId,
        action: "INVENTORY_RESERVATION_RELEASED",
        entityType: "HeldSale",
        entityId: orderId,
        metadata: { reason, reservationCount: released.count }
      }
    });
  }
  return released.count;
}

export async function syncOrderReservations(
  transaction: Prisma.TransactionClient,
  order: ReservationOrder,
  items: ReservableItem[],
  actorId: string
) {
  await releaseOrderReservations(transaction, order.id, actorId, "Order reservation recalculated");
  if (!reservationOrderStatuses.has(order.status) || !items.length) return [];
  if (items.some((item) => !item.warehouseId)) {
    throw new AppError(409, "ORDER_WAREHOUSE_REQUIRED", "Every confirmed order item must have an inventory location.");
  }

  const requested = new Map<string, { productId: string; warehouseId: string; quantity: number }>();
  for (const item of items) {
    const warehouseId = item.warehouseId as string;
    const itemKey = key(item.productId, warehouseId);
    const current = requested.get(itemKey);
    requested.set(itemKey, {
      productId: item.productId,
      warehouseId,
      quantity: (current?.quantity ?? 0) + Number(item.baseQuantity)
    });
  }

  const groups = [...requested.values()];
  const [stocks, reservations] = await Promise.all([
    transaction.inventoryStock.findMany({
      where: { OR: groups.map((group) => ({ productId: group.productId, warehouseId: group.warehouseId })) }
    }),
    transaction.inventoryReservation.groupBy({
      by: ["productId", "warehouseId"],
      where: {
        status: "ACTIVE",
        OR: groups.map((group) => ({ productId: group.productId, warehouseId: group.warehouseId }))
      },
      _sum: { quantity: true }
    })
  ]);
  const stockByKey = new Map(stocks.map((stock) => [key(stock.productId, stock.warehouseId), Number(stock.quantity)]));
  const reservedByKey = new Map(reservations.map((reservation) => [key(reservation.productId, reservation.warehouseId), Number(reservation._sum.quantity ?? 0)]));

  for (const group of groups) {
    const groupKey = key(group.productId, group.warehouseId);
    const available = (stockByKey.get(groupKey) ?? 0) - (reservedByKey.get(groupKey) ?? 0);
    if (available < group.quantity) {
      throw new AppError(409, "INSUFFICIENT_AVAILABLE_STOCK", `Only ${available} base units remain available after other active orders.`);
    }
  }

  await transaction.inventoryReservation.createMany({
    data: items.map((item) => ({
      storeId: order.storeId,
      heldSaleId: order.id,
      heldSaleItemId: item.id,
      productId: item.productId,
      warehouseId: item.warehouseId as string,
      quantity: Number(item.baseQuantity),
      status: "ACTIVE",
      reason: `Reserved for ${order.orderNumber ?? order.id}`
    }))
  });
  await transaction.auditLog.create({
    data: {
      actorId,
      action: "INVENTORY_RESERVED",
      entityType: "HeldSale",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, items: groups }
    }
  });
  return groups;
}

export async function quantityReservedByOtherOrders(
  transaction: Prisma.TransactionClient,
  productId: string,
  warehouseId: string,
  heldSaleId?: string
) {
  const result = await transaction.inventoryReservation.aggregate({
    where: {
      productId,
      warehouseId,
      status: "ACTIVE",
      heldSaleId: heldSaleId ? { not: heldSaleId } : undefined
    },
    _sum: { quantity: true }
  });
  return Number(result._sum.quantity ?? 0);
}

export async function consumeOrderReservations(transaction: Prisma.TransactionClient, orderId: string) {
  return transaction.inventoryReservation.updateMany({
    where: { heldSaleId: orderId, status: "ACTIVE" },
    data: { status: "CONSUMED", consumedAt: new Date(), reason: "Consumed by completed sale" }
  });
}
