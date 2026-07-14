import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    inventoryStock: {
      upsert: vi.fn(),
      update: vi.fn()
    },
    inventoryMovement: {
      create: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    }
  };

  const prisma = {
    product: {
      findFirst: vi.fn(),
      findMany: vi.fn()
    },
    warehouse: {
      findFirst: vi.fn(),
      findMany: vi.fn()
    },
    inventoryStock: {
      findMany: vi.fn()
    },
    inventoryReservation: {
      groupBy: vi.fn()
    },
    inventoryMovement: {
      findMany: vi.fn(),
      count: vi.fn()
    },
    $transaction: vi.fn()
  };

  return {
    prisma,
    publishRealtimeEvent: vi.fn(),
    transaction
  };
});

vi.mock("../src/config/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../src/realtime/bus.js", () => ({ publishRealtimeEvent: mocks.publishRealtimeEvent }));

import { AppError } from "../src/shared/app-error.js";
import {
  adjustInventoryCount,
  createInventoryMovement,
  listStock,
  transferInventory
} from "../src/modules/inventory/inventory.service.js";

const actor = { userId: "user-1", storeId: "store-1" };
const product = {
  id: "product-1",
  sku: "STEEL-1",
  name: "Steel bar",
  costPrice: 100,
  minimumStock: 2,
  inventoryUnit: "PIECE"
};
const warehouse = { id: "warehouse-1", name: "Main Warehouse", code: "MAIN", storeId: "store-1" };

describe("inventory service compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (Array.isArray(operation)) {
        return Promise.all(operation);
      }
      if (typeof operation === "function") {
        return operation(mocks.transaction);
      }
      throw new Error("Unsupported transaction operation.");
    });
    mocks.prisma.product.findFirst.mockResolvedValue({ id: product.id, name: product.name });
    mocks.prisma.warehouse.findFirst.mockResolvedValue(warehouse);
    mocks.transaction.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.prisma.inventoryReservation.groupBy.mockResolvedValue([]);
  });

  it("lists every active product and warehouse pair, including zero-stock rows", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([product]);
    mocks.prisma.warehouse.findMany.mockResolvedValue([warehouse]);
    mocks.prisma.inventoryStock.findMany.mockResolvedValue([]);

    const result = await listStock({ page: 1, pageSize: 25, lowStockOnly: false });

    expect(result).toMatchObject({
      items: [
        {
          id: "zero-product-1-warehouse-1",
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: 0,
          reservedQuantity: 0,
          availableQuantity: 0,
          product,
          warehouse
        }
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1
    });
  });

  it("creates stock-in and stock-out records atomically with audit and realtime events", async () => {
    mocks.transaction.inventoryStock.upsert
      .mockResolvedValueOnce({ id: "stock-1", quantity: 5 })
      .mockResolvedValueOnce({ id: "stock-1", quantity: 8 });
    mocks.transaction.inventoryStock.update
      .mockResolvedValueOnce({ id: "stock-1", quantity: 8, product, warehouse })
      .mockResolvedValueOnce({ id: "stock-1", quantity: 6, product, warehouse });
    mocks.transaction.inventoryMovement.create
      .mockResolvedValueOnce({ id: "movement-in" })
      .mockResolvedValueOnce({ id: "movement-out" });

    const stockIn = await createInventoryMovement(
      {
        productId: product.id,
        warehouseId: warehouse.id,
        type: "STOCK_IN",
        quantity: 3,
        unitCost: 100,
        reason: "Received delivery"
      },
      actor
    );
    const stockOut = await createInventoryMovement(
      {
        productId: product.id,
        warehouseId: warehouse.id,
        type: "STOCK_OUT",
        quantity: 2,
        reason: "Manual stock removal"
      },
      actor
    );

    expect(stockIn.stock.quantity).toBe(8);
    expect(stockOut.stock.quantity).toBe(6);
    expect(mocks.transaction.inventoryStock.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { quantity: 8 } })
    );
    expect(mocks.transaction.inventoryStock.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: { quantity: 6 } })
    );
    expect(mocks.transaction.auditLog.create).toHaveBeenCalledTimes(2);
    expect(mocks.publishRealtimeEvent).toHaveBeenCalledTimes(2);
  });

  it("rejects insufficient stock before writing a movement or audit record", async () => {
    mocks.transaction.inventoryStock.upsert.mockResolvedValue({ id: "stock-1", quantity: 1 });

    await expect(
      createInventoryMovement(
        {
          productId: product.id,
          warehouseId: warehouse.id,
          type: "DAMAGE",
          quantity: 2,
          reason: "Damaged stock"
        },
        actor
      )
    ).rejects.toThrow("Inventory quantity cannot become negative.");

    expect(mocks.transaction.inventoryStock.update).not.toHaveBeenCalled();
    expect(mocks.transaction.inventoryMovement.create).not.toHaveBeenCalled();
    expect(mocks.transaction.auditLog.create).not.toHaveBeenCalled();
    expect(mocks.publishRealtimeEvent).not.toHaveBeenCalled();
  });

  it("records a physical count as an absolute stock value and signed adjustment", async () => {
    mocks.transaction.inventoryStock.upsert.mockResolvedValue({ id: "stock-1", quantity: 7.5 });
    mocks.transaction.inventoryStock.update.mockResolvedValue({ id: "stock-1", quantity: 5, product, warehouse });
    mocks.transaction.inventoryMovement.create.mockResolvedValue({ id: "movement-adjustment" });

    const result = await adjustInventoryCount(
      {
        productId: product.id,
        warehouseId: warehouse.id,
        countedQuantity: 5,
        reason: "Physical count"
      },
      actor
    );

    expect(result.stock.quantity).toBe(5);
    expect(mocks.transaction.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "ADJUSTMENT", quantity: -2.5 })
    });
    expect(mocks.transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "INVENTORY_COUNT_ADJUSTED",
        metadata: expect.objectContaining({ previousQuantity: 7.5, countedQuantity: 5, delta: -2.5 })
      })
    });
  });

  it("creates paired transfer movements and keeps both warehouse updates in one transaction", async () => {
    const destination = { id: "warehouse-2", name: "Overflow", code: "OVER", storeId: "store-1" };
    mocks.prisma.warehouse.findFirst.mockResolvedValueOnce(warehouse).mockResolvedValueOnce(destination);
    mocks.transaction.inventoryStock.upsert
      .mockResolvedValueOnce({ id: "stock-from", quantity: 10 })
      .mockResolvedValueOnce({ id: "stock-to", quantity: 1 });
    mocks.transaction.inventoryStock.update
      .mockResolvedValueOnce({ id: "stock-from", quantity: 6, product, warehouse })
      .mockResolvedValueOnce({ id: "stock-to", quantity: 5, product, warehouse: destination });
    mocks.transaction.inventoryMovement.create
      .mockResolvedValueOnce({ id: "movement-out" })
      .mockResolvedValueOnce({ id: "movement-in" });

    const result = await transferInventory(
      {
        productId: product.id,
        fromWarehouseId: warehouse.id,
        toWarehouseId: destination.id,
        quantity: 4,
        reason: "Balance locations"
      },
      actor
    );

    expect(result.fromStock.quantity).toBe(6);
    expect(result.toStock.quantity).toBe(5);
    expect(mocks.transaction.inventoryMovement.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ type: "TRANSFER", quantity: -4 }) })
    );
    expect(mocks.transaction.inventoryMovement.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ type: "TRANSFER", quantity: 4 }) })
    );
    expect(mocks.publishRealtimeEvent).toHaveBeenCalledTimes(2);
  });

  it("does not publish transfer events when a transactional write fails", async () => {
    const destination = { id: "warehouse-2", name: "Overflow", code: "OVER", storeId: "store-1" };
    mocks.prisma.warehouse.findFirst.mockResolvedValueOnce(warehouse).mockResolvedValueOnce(destination);
    mocks.transaction.inventoryStock.upsert
      .mockResolvedValueOnce({ id: "stock-from", quantity: 10 })
      .mockResolvedValueOnce({ id: "stock-to", quantity: 1 });
    mocks.transaction.inventoryStock.update
      .mockResolvedValueOnce({ id: "stock-from", quantity: 6 })
      .mockRejectedValueOnce(new Error("Database write failed."));
    mocks.transaction.inventoryMovement.create.mockResolvedValue({ id: "movement" });

    await expect(
      transferInventory(
        {
          productId: product.id,
          fromWarehouseId: warehouse.id,
          toWarehouseId: destination.id,
          quantity: 4,
          reason: "Balance locations"
        },
        actor
      )
    ).rejects.toThrow("Database write failed.");

    expect(mocks.transaction.auditLog.create).not.toHaveBeenCalled();
    expect(mocks.publishRealtimeEvent).not.toHaveBeenCalled();
  });

  it("preserves product and warehouse not-found errors", async () => {
    mocks.prisma.product.findFirst.mockResolvedValueOnce(null);

    await expect(
      createInventoryMovement(
        {
          productId: "missing-product",
          warehouseId: warehouse.id,
          type: "STOCK_IN",
          quantity: 1,
          reason: "Received delivery"
        },
        actor
      )
    ).rejects.toMatchObject<AppError>({ statusCode: 404, code: "PRODUCT_NOT_FOUND", message: "Product was not found." });

    mocks.prisma.product.findFirst.mockResolvedValueOnce({ id: product.id, name: product.name });
    mocks.prisma.warehouse.findFirst.mockResolvedValueOnce(null);

    await expect(
      createInventoryMovement(
        {
          productId: product.id,
          warehouseId: "missing-warehouse",
          type: "STOCK_IN",
          quantity: 1,
          reason: "Received delivery"
        },
        actor
      )
    ).rejects.toMatchObject<AppError>({ statusCode: 404, code: "WAREHOUSE_NOT_FOUND", message: "Warehouse was not found." });
  });
});
