import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeOrderReservations,
  releaseOrderReservations,
  syncOrderReservations
} from "../src/modules/restaurant/order-reservation.service.js";

const transaction = {
  inventoryReservation: {
    updateMany: vi.fn(),
    groupBy: vi.fn(),
    createMany: vi.fn(),
    aggregate: vi.fn()
  },
  inventoryStock: { findMany: vi.fn() },
  auditLog: { create: vi.fn() }
};

const order = { id: "order-1", storeId: "store-1", status: "CONFIRMED", orderNumber: "DINE-000001" };
const items = [{ id: "item-1", productId: "product-1", warehouseId: "warehouse-1", baseQuantity: 5 }];

describe("restaurant inventory reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.inventoryReservation.updateMany.mockResolvedValue({ count: 0 });
    transaction.inventoryReservation.groupBy.mockResolvedValue([{ productId: "product-1", warehouseId: "warehouse-1", _sum: { quantity: 3 } }]);
    transaction.inventoryStock.findMany.mockResolvedValue([{ productId: "product-1", warehouseId: "warehouse-1", quantity: 10 }]);
    transaction.inventoryReservation.createMany.mockResolvedValue({ count: 1 });
    transaction.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("reserves only stock still available after other active orders", async () => {
    await syncOrderReservations(transaction as never, order, items, "user-1");

    expect(transaction.inventoryReservation.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ heldSaleId: "order-1", productId: "product-1", warehouseId: "warehouse-1", quantity: 5, status: "ACTIVE" })]
    });
  });

  it("rejects a reservation that exceeds physical stock less other reservations", async () => {
    await expect(syncOrderReservations(transaction as never, order, [{ ...items[0], baseQuantity: 8 }], "user-1")).rejects.toThrow(
      "Only 7 base units remain available"
    );
    expect(transaction.inventoryReservation.createMany).not.toHaveBeenCalled();
  });

  it("releases open-order reservations and consumes checkout reservations idempotently", async () => {
    transaction.inventoryReservation.updateMany.mockResolvedValue({ count: 1 });
    await syncOrderReservations(transaction as never, { ...order, status: "OPEN" }, items, "user-1");
    await releaseOrderReservations(transaction as never, order.id, "user-1", "Cancelled");
    await consumeOrderReservations(transaction as never, order.id);

    expect(transaction.inventoryReservation.createMany).not.toHaveBeenCalled();
    expect(transaction.inventoryReservation.updateMany).toHaveBeenLastCalledWith({
      where: { heldSaleId: "order-1", status: "ACTIVE" },
      data: { status: "CONSUMED", consumedAt: expect.any(Date), reason: "Consumed by completed sale" }
    });
  });
});
