import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    receiptSequence: { upsert: vi.fn() },
    product: { findFirst: vi.fn() },
    inventoryStock: { upsert: vi.fn(), update: vi.fn() },
    sale: { create: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    auditLog: { create: vi.fn() }
  };
  const prisma = { $transaction: vi.fn() };

  return { prisma, publishRealtimeEvent: vi.fn(), transaction };
});

vi.mock("../src/config/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../src/realtime/bus.js", () => ({ publishRealtimeEvent: mocks.publishRealtimeEvent }));

import { createSale } from "../src/modules/sales/sale.service.js";

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
});
