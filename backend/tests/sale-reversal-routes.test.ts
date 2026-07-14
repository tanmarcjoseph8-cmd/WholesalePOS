import type { Server } from "node:http";
import { once } from "node:events";
import express, { type RequestHandler } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSale: vi.fn(), listSales: vi.fn(), refundSale: vi.fn(), voidSale: vi.fn() }));
vi.mock("../src/modules/sales/sale.service.js", () => ({ createSale: mocks.createSale, listSales: mocks.listSales }));
vi.mock("../src/modules/sales/refund.service.js", () => ({ refundSale: mocks.refundSale, voidSale: mocks.voidSale }));
vi.mock("../src/modules/auth/actor.js", () => ({ getActor: () => ({ userId: "user-1", storeId: "store-1" }) }));
vi.mock("../src/modules/auth/auth.middleware.js", () => {
  const requireAuth: RequestHandler = (_request, _response, next) => next();
  return {
    requireAuth,
    requirePermission: (permission: string): RequestHandler => (request, response, next) => {
      const permissions = new Set(String(request.headers["x-permissions"] ?? "").split(",").filter(Boolean));
      if (permissions.has(permission)) next();
      else response.status(403).json({ code: "PERMISSION_REQUIRED" });
    }
  };
});

import { saleRouter } from "../src/modules/sales/sale.routes.js";

describe("sale reversal routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/sales", saleRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not expose a port");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refundSale.mockResolvedValue({ id: "refund-1" });
    mocks.voidSale.mockResolvedValue({ id: "void-1" });
  });

  const post = (path: string, body: object, permissions: string) => fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-permissions": permissions }, body: JSON.stringify(body) });

  it("requires dedicated refund and void permissions in addition to checkout access", async () => {
    const denied = await post("/api/sales/sale-1/refunds", { reason: "Customer return", items: [{ saleItemId: "item-1", quantity: 1 }] }, "sales.manage");
    const refund = await post("/api/sales/sale-1/refunds", { reason: "Customer return", items: [{ saleItemId: "item-1", quantity: 1 }] }, "sales.manage,sales.refund");
    const voided = await post("/api/sales/sale-1/void", { reason: "Duplicate payment" }, "sales.manage,sales.void");
    expect(denied.status).toBe(403);
    expect(refund.status).toBe(201);
    expect(voided.status).toBe(201);
    expect(mocks.refundSale).toHaveBeenCalledOnce();
    expect(mocks.voidSale).toHaveBeenCalledOnce();
  });
});
