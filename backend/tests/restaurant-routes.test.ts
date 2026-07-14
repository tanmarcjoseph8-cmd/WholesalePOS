import type { Server } from "node:http";
import { once } from "node:events";
import express, { type RequestHandler } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireRestaurantOrderLock: vi.fn(),
  assignRestaurantOrderTables: vi.fn(),
  cancelRestaurantOrder: vi.fn(),
  checkoutRestaurantOrder: vi.fn(),
  createRestaurantOrder: vi.fn(),
  createRestaurantTable: vi.fn(),
  disableRestaurantTable: vi.fn(),
  getRestaurantOrder: vi.fn(),
  listRestaurantOrders: vi.fn(),
  listRestaurantTables: vi.fn(),
  mergeRestaurantOrders: vi.fn(),
  releaseRestaurantOrderLock: vi.fn(),
  reopenRestaurantOrder: vi.fn(),
  restoreRestaurantTable: vi.fn(),
  splitRestaurantOrder: vi.fn(),
  undoRestaurantOrderItemChange: vi.fn(),
  updateRestaurantOrder: vi.fn(),
  updateRestaurantTable: vi.fn()
}));

vi.mock("../src/modules/restaurant/restaurant.service.js", () => mocks);
vi.mock("../src/modules/auth/actor.js", () => ({ getActor: () => ({ userId: "user-1", storeId: "store-1" }) }));
vi.mock("../src/modules/auth/auth.middleware.js", () => {
  const permissions = (request: express.Request) => new Set(String(request.headers["x-permissions"] ?? "").split(",").filter(Boolean));
  const requireAuth: RequestHandler = (request, response, next) => {
    if (request.headers["x-authenticated"] === "true") next();
    else response.status(401).json({ code: "AUTHENTICATION_REQUIRED" });
  };
  return {
    requireAuth,
    requirePermission: (permission: string): RequestHandler => (request, response, next) => {
      if (permissions(request).has(permission)) next();
      else response.status(403).json({ code: "PERMISSION_REQUIRED" });
    }
  };
});

import { restaurantRouter } from "../src/modules/restaurant/restaurant.routes.js";

describe("restaurant routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/restaurant", restaurantRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP port.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRestaurantTables.mockResolvedValue([]);
    mocks.createRestaurantTable.mockResolvedValue({ id: "table-1" });
    mocks.listRestaurantOrders.mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } });
    mocks.createRestaurantOrder.mockResolvedValue({ id: "order-1" });
    mocks.checkoutRestaurantOrder.mockResolvedValue({ id: "sale-1" });
    mocks.mergeRestaurantOrders.mockResolvedValue({ id: "order-1" });
    mocks.splitRestaurantOrder.mockResolvedValue({ source: { id: "order-1" }, split: { id: "order-2" } });
    mocks.restoreRestaurantTable.mockResolvedValue({ id: "table-1", isActive: true });
  });

  const request = (path: string, init: RequestInit = {}, permission = "orders.manage") =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-authenticated": "true", "x-permissions": permission, ...init.headers }
    });

  it("allows order staff to list and create active orders", async () => {
    const list = await request("/api/restaurant/orders");
    const create = await request("/api/restaurant/orders", {
      method: "POST",
      body: JSON.stringify({ orderType: "WALK_IN", guestCount: 1, items: [] })
    });
    expect(list.status).toBe(200);
    expect(create.status).toBe(201);
    expect(mocks.createRestaurantOrder).toHaveBeenCalledOnce();
  });

  it("requires table management permission for table changes", async () => {
    const forbidden = await request(
      "/api/restaurant/tables",
      { method: "POST", body: JSON.stringify({ number: "1", section: "Main", capacity: 2 }) },
      "orders.manage"
    );
    const allowed = await request(
      "/api/restaurant/tables",
      { method: "POST", body: JSON.stringify({ number: "1", section: "Main", capacity: 2 }) },
      "tables.manage"
    );
    expect(forbidden.status).toBe(403);
    expect(allowed.status).toBe(201);
    expect(mocks.createRestaurantTable).toHaveBeenCalledOnce();
  });

  it("requires sales permission for checkout", async () => {
    const body = JSON.stringify({ expectedVersion: 1, payments: [{ method: "CASH", amount: 100 }] });
    const forbidden = await request("/api/restaurant/orders/order-1/checkout", { method: "POST", body }, "orders.manage");
    const allowed = await request("/api/restaurant/orders/order-1/checkout", { method: "POST", body }, "sales.manage");
    expect(forbidden.status).toBe(403);
    expect(allowed.status).toBe(201);
    expect(mocks.checkoutRestaurantOrder).toHaveBeenCalledOnce();
  });

  it("protects restore, merge, and split with their existing permissions", async () => {
    const restore = await request("/api/restaurant/tables/table-1/restore", { method: "POST", body: "{}" }, "tables.manage");
    const mergeBody = JSON.stringify({ expectedVersion: 1, sourceOrderId: "order-2", sourceExpectedVersion: 1, reason: "Same party" });
    const forbiddenMerge = await request("/api/restaurant/orders/order-1/merge", { method: "POST", body: mergeBody }, "orders.manage");
    const allowedMerge = await request("/api/restaurant/orders/order-1/merge", { method: "POST", body: mergeBody }, "orders.split-bill");
    expect(restore.status).toBe(200);
    expect(forbiddenMerge.status).toBe(403);
    expect(allowedMerge.status).toBe(200);
    expect(mocks.restoreRestaurantTable).toHaveBeenCalledOnce();
    expect(mocks.mergeRestaurantOrders).toHaveBeenCalledOnce();
  });
});
