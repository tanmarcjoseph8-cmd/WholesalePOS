import type { Server } from "node:http";
import { once } from "node:events";
import express, { type RequestHandler } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adjustInventoryCount: vi.fn(),
  createInventoryMovement: vi.fn(),
  listMovements: vi.fn(),
  listStock: vi.fn(),
  listWarehouses: vi.fn(),
  transferInventory: vi.fn()
}));

vi.mock("../src/modules/inventory/inventory.service.js", () => mocks);
vi.mock("../src/modules/auth/actor.js", () => ({
  getActor: () => ({ userId: "user-1", storeId: "store-1" })
}));
vi.mock("../src/modules/auth/auth.middleware.js", () => {
  const readPermissions = (value: string | string[] | undefined) =>
    new Set((Array.isArray(value) ? value.join(",") : (value ?? "")).split(",").filter(Boolean));
  const requireAuth: RequestHandler = (request, response, next) => {
    if (request.headers["x-authenticated"] === "true") {
      next();
      return;
    }
    response.status(401).json({ code: "AUTHENTICATION_REQUIRED" });
  };
  const requireAnyPermission = (permissions: string[]): RequestHandler => (request, response, next) => {
    const granted = readPermissions(request.headers["x-permissions"]);
    if (permissions.some((permission) => granted.has(permission))) {
      next();
      return;
    }
    response.status(403).json({ code: "PERMISSION_REQUIRED" });
  };

  return {
    requireAuth,
    requireAnyPermission,
    requirePermission: (permission: string) => requireAnyPermission([permission])
  };
});

import { inventoryRouter } from "../src/modules/inventory/inventory.routes.js";

describe("inventory routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/inventory", inventoryRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP port.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listWarehouses.mockResolvedValue([{ id: "warehouse-1" }]);
    mocks.listStock.mockResolvedValue({ items: [{ id: "stock-1" }], total: 1 });
    mocks.listMovements.mockResolvedValue({ items: [{ id: "movement-1" }], total: 1 });
    mocks.createInventoryMovement.mockResolvedValue({ stock: { id: "stock-1" }, movement: { id: "movement-1" } });
    mocks.adjustInventoryCount.mockResolvedValue({ stock: { id: "stock-1" }, movement: { id: "adjustment-1" } });
    mocks.transferInventory.mockResolvedValue({ transferReferenceId: "transfer-1" });
  });

  const request = (path: string, init: RequestInit = {}, permission = "inventory.manage") =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-authenticated": "true",
        "x-permissions": permission,
        ...init.headers
      }
    });

  it("serves warehouse, stock, and movement queries with their existing response status", async () => {
    const warehouses = await request("/api/inventory/warehouses", {}, "sales.manage");
    const stock = await request("/api/inventory/stock?page=1&pageSize=25", {}, "sales.manage");
    const movements = await request("/api/inventory/movements?page=1&pageSize=25");

    expect(warehouses.status).toBe(200);
    expect(await warehouses.json()).toEqual([{ id: "warehouse-1" }]);
    expect(stock.status).toBe(200);
    expect(await stock.json()).toEqual({ items: [{ id: "stock-1" }], total: 1 });
    expect(movements.status).toBe(200);
    expect(await movements.json()).toEqual({ items: [{ id: "movement-1" }], total: 1 });
    expect(mocks.listStock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 25, lowStockOnly: false }));
  });

  it("serves movement, count, and transfer commands with their existing 201 status", async () => {
    const movement = await request("/api/inventory/movements", {
      method: "POST",
      body: JSON.stringify({
        productId: "product-1",
        warehouseId: "warehouse-1",
        type: "STOCK_IN",
        quantity: 5,
        unitCost: 100,
        reason: "Received delivery"
      })
    });
    const count = await request("/api/inventory/counts", {
      method: "POST",
      body: JSON.stringify({
        productId: "product-1",
        warehouseId: "warehouse-1",
        countedQuantity: 4,
        reason: "Physical count"
      })
    });
    const transfer = await request("/api/inventory/transfers", {
      method: "POST",
      body: JSON.stringify({
        productId: "product-1",
        fromWarehouseId: "warehouse-1",
        toWarehouseId: "warehouse-2",
        quantity: 2,
        reason: "Balance locations"
      })
    });

    expect(movement.status).toBe(201);
    expect(count.status).toBe(201);
    expect(transfer.status).toBe(201);
    expect(mocks.createInventoryMovement).toHaveBeenCalledOnce();
    expect(mocks.adjustInventoryCount).toHaveBeenCalledOnce();
    expect(mocks.transferInventory).toHaveBeenCalledOnce();
  });

  it("preserves authentication and inventory-management permission requirements", async () => {
    const unauthenticated = await fetch(`${baseUrl}/api/inventory/stock`);
    const forbidden = await request(
      "/api/inventory/movements",
      {
        method: "POST",
        body: JSON.stringify({
          productId: "product-1",
          warehouseId: "warehouse-1",
          type: "STOCK_IN",
          quantity: 1,
          reason: "Received delivery"
        })
      },
      "sales.manage"
    );

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(mocks.createInventoryMovement).not.toHaveBeenCalled();
  });
});
