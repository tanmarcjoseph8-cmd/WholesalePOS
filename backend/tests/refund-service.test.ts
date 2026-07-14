import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    refund: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
    sale: { findFirst: vi.fn(), update: vi.fn() },
    receiptSequence: { upsert: vi.fn() },
    inventoryMovement: { findFirst: vi.fn(), create: vi.fn() },
    inventoryStock: { upsert: vi.fn(), update: vi.fn() },
    refundItem: { create: vi.fn() },
    auditLog: { create: vi.fn() }
  };
  return { prisma: { $transaction: vi.fn() }, transaction, publishRealtimeEvent: vi.fn() };
});

vi.mock("../src/config/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../src/realtime/bus.js", () => ({ publishRealtimeEvent: mocks.publishRealtimeEvent }));

import { refundSale, voidSale } from "../src/modules/sales/refund.service.js";

const actor = { userId: "manager-1", storeId: "store-1" };
const completedSale = {
  id: "sale-1",
  storeId: "store-1",
  customerId: null,
  receiptNumber: "POS-000001",
  status: "COMPLETED",
  grandTotal: 100,
  items: [{ id: "sale-item-1", productId: "product-1", warehouseId: "warehouse-1", soldQuantity: 2, soldUnit: "PIECE", baseQuantity: 2, unitPrice: 50, taxAmount: 0, lineTotal: 100 }],
  payments: [{ method: "CASH", amount: 100, reference: null }],
  refunds: []
};

describe("sale refund inventory reversal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation !== "function") throw new Error("Expected transaction callback");
      return operation(mocks.transaction);
    });
    mocks.transaction.refund.findUnique.mockResolvedValue(null);
    mocks.transaction.refund.findFirst.mockResolvedValue(null);
    mocks.transaction.sale.findFirst.mockResolvedValue(completedSale);
    mocks.transaction.receiptSequence.upsert.mockResolvedValue({ prefix: "REF", nextNumber: 2, padding: 6 });
    mocks.transaction.refund.create.mockResolvedValue({ id: "refund-1" });
    mocks.transaction.inventoryStock.upsert.mockResolvedValue({ id: "stock-1", quantity: 5 });
    mocks.transaction.inventoryMovement.create.mockResolvedValue({ id: "movement-1" });
    mocks.transaction.inventoryStock.update.mockResolvedValue({ id: "stock-1", quantity: 6 });
    mocks.transaction.refundItem.create.mockResolvedValue({ id: "refund-item-1" });
    mocks.transaction.sale.update.mockResolvedValue({ id: "sale-1", status: "PARTIALLY_REFUNDED" });
    mocks.transaction.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.refund.findUniqueOrThrow.mockResolvedValue({ id: "refund-1", originalSaleId: "sale-1", receiptNumber: "REF-000001", kind: "REFUND", grandTotal: 50, items: [], payments: [], originalSale: null });
  });

  it("restores only the refunded base quantity through a compensating movement", async () => {
    await refundSale("sale-1", { requestKey: "refund-request-1", reason: "Customer return", items: [{ saleItemId: "sale-item-1", quantity: 1 }] }, actor);

    expect(mocks.transaction.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "RETURN", quantity: 1, referenceType: "Refund", referenceId: "refund-1" })
    });
    expect(mocks.transaction.inventoryStock.update).toHaveBeenCalledWith({ where: { id: "stock-1" }, data: { quantity: 6 } });
    expect(mocks.transaction.sale.update).toHaveBeenCalledWith({ where: { id: "sale-1" }, data: { status: "PARTIALLY_REFUNDED" } });
  });

  it("returns an existing full void without restoring stock twice", async () => {
    const previousVoid = { id: "refund-void-1", originalSaleId: "sale-1", receiptNumber: "REF-000002", kind: "VOID", items: [], payments: [], originalSale: null };
    mocks.transaction.refund.findFirst.mockResolvedValue(previousVoid);

    const result = await voidSale("sale-1", { reason: "Duplicate payment" }, actor);

    expect(result).toBe(previousVoid);
    expect(mocks.transaction.sale.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.inventoryMovement.create).not.toHaveBeenCalled();
    expect(mocks.transaction.inventoryStock.update).not.toHaveBeenCalled();
  });
});
