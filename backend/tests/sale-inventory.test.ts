import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    receiptSequence: { upsert: vi.fn() },
    product: { findFirst: vi.fn() },
    inventoryStock: { upsert: vi.fn(), update: vi.fn() },
    sale: { create: vi.fn() },
    heldSale: { findFirst: vi.fn(), updateMany: vi.fn() },
    restaurantTable: { updateMany: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    auditLog: { create: vi.fn() }
  };
  const prisma = { $transaction: vi.fn() };

  return { prisma, publishRealtimeEvent: vi.fn(), transaction };
});

vi.mock("../src/config/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../src/realtime/bus.js", () => ({ publishRealtimeEvent: mocks.publishRealtimeEvent }));

import { completeHeldSale, createSale } from "../src/modules/sales/sale.service.js";

const actor = { userId: "cashier-1", storeId: "store-1" };
const saleInput = {
  items: [
    {
      productId: "product-1",
      warehouseId: "warehouse-1",
      quantity: 2,
      soldUnit: "PIECE" as const,
      discount: 0
    }
  ],
  payments: [{ method: "CASH" as const, amount: 100 }]
};

describe("sale inventory integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation !== "function") {
        throw new Error("Expected a transaction callback.");
      }
      return operation(mocks.transaction);
    });
    mocks.transaction.receiptSequence.upsert.mockResolvedValue({ prefix: "POS", nextNumber: 2, padding: 6 });
    mocks.transaction.product.findFirst.mockResolvedValue({
      id: "product-1",
      name: "Steel bar",
      inventoryUnit: "PIECE",
      sellingUnit: "PIECE",
      packageSize: 1,
      retailPrice: 50,
      wholesalePrice: 45,
      wholesaleThreshold: 10,
      taxRate: 0
    });
    mocks.transaction.inventoryStock.upsert.mockResolvedValue({ id: "stock-1", quantity: 5 });
    mocks.transaction.sale.create.mockResolvedValue({
      id: "sale-1",
      receiptNumber: "POS-000001",
      items: [],
      payments: []
    });
    mocks.transaction.inventoryStock.update.mockResolvedValue({ id: "stock-1", quantity: 3 });
    mocks.transaction.inventoryMovement.create.mockResolvedValue({ id: "movement-1" });
    mocks.transaction.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.heldSale.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.restaurantTable.updateMany.mockResolvedValue({ count: 1 });
  });

  it("deducts the base quantity and records the sale movement in the sale transaction", async () => {
    await createSale(saleInput, actor);

    expect(mocks.transaction.inventoryStock.update).toHaveBeenCalledWith({
      where: { id: "stock-1" },
      data: { quantity: 3 }
    });
    expect(mocks.transaction.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "product-1",
        warehouseId: "warehouse-1",
        type: "SALE",
        quantity: -2,
        referenceType: "Sale",
        referenceId: "sale-1"
      })
    });
    expect(mocks.publishRealtimeEvent).toHaveBeenCalledTimes(2);
  });

  it("rejects a sale that would make stock negative before creating the sale", async () => {
    mocks.transaction.inventoryStock.upsert.mockResolvedValue({ id: "stock-1", quantity: 1 });

    await expect(createSale(saleInput, actor)).rejects.toThrow("Inventory quantity cannot become negative.");

    expect(mocks.transaction.sale.create).not.toHaveBeenCalled();
    expect(mocks.transaction.inventoryStock.update).not.toHaveBeenCalled();
    expect(mocks.transaction.inventoryMovement.create).not.toHaveBeenCalled();
    expect(mocks.publishRealtimeEvent).not.toHaveBeenCalled();
  });

  it("stores restaurant order metadata and includes service charge and tip in the total", async () => {
    await createSale(
      {
        ...saleInput,
        orderNumber: "TAKE-0001",
        orderType: "TAKEOUT",
        serviceCharge: 10,
        tip: 5,
        payments: [{ method: "CASH", amount: 115 }]
      },
      actor
    );

    expect(mocks.transaction.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderNumber: "TAKE-0001",
          orderType: "TAKEOUT",
          grandTotal: 115,
          serviceCharge: 10,
          tip: 5
        })
      })
    );
  });

  it("atomically completes a held restaurant order through the normal sale inventory transaction", async () => {
    mocks.transaction.heldSale.findFirst.mockResolvedValue({
      id: "order-1",
      storeId: "store-1",
      customerId: null,
      orderNumber: "DINE-000001",
      orderType: "DINE_IN",
      status: "SERVED",
      version: 4,
      serviceCharge: 10,
      tip: 0,
      lockedByUserId: "cashier-1",
      lockExpiresAt: new Date(Date.now() + 60_000),
      completedSale: null,
      items: [
        {
          productId: "product-1",
          warehouseId: "warehouse-1",
          quantity: 2,
          soldUnit: "PIECE",
          unitPrice: 50,
          discount: 0
        }
      ]
    });

    await completeHeldSale(
      "order-1",
      { expectedVersion: 4, payments: [{ method: "CASH", amount: 110 }] },
      actor
    );

    expect(mocks.transaction.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ heldSaleId: "order-1", orderNumber: "DINE-000001", orderType: "DINE_IN" }) })
    );
    expect(mocks.transaction.heldSale.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "order-1", version: 4 }),
        data: expect.objectContaining({ status: "COMPLETED", version: { increment: 1 } })
      })
    );
    expect(mocks.transaction.restaurantTable.updateMany).toHaveBeenCalledWith({
      where: { activeOrderId: "order-1" },
      data: { activeOrderId: null, status: "CLEANING", guestCount: 0 }
    });
    expect(mocks.transaction.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "SALE", quantity: -2, referenceId: "sale-1" }) })
    );
  });

  it("rejects checkout when the held order version is stale before creating a sale", async () => {
    mocks.transaction.heldSale.findFirst.mockResolvedValue({
      id: "order-1",
      status: "OPEN",
      version: 5,
      completedSale: null,
      lockedByUserId: null,
      lockExpiresAt: null,
      items: []
    });

    await expect(completeHeldSale("order-1", { expectedVersion: 4, payments: [{ method: "CASH", amount: 100 }] }, actor)).rejects.toThrow(
      "This order changed"
    );
    expect(mocks.transaction.sale.create).not.toHaveBeenCalled();
    expect(mocks.transaction.inventoryStock.update).not.toHaveBeenCalled();
  });
});
