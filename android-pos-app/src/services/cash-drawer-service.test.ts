import { describe, expect, it } from "vitest";
import type { LocalDatabase } from "../data/database";
import type { LocalUser } from "../domain/models";
import { CashDrawerService, requireOpenCashSession } from "./cash-drawer-service";

const cashier: LocalUser = { id: "cashier-1", login: "cashier", name: "Cashier", role: "CASHIER", permissions: ["cash_drawer.use"] };

describe("CashDrawerService authorization", () => {
  it("rejects access without a cash drawer permission before reading data", async () => {
    let queried = false;
    const db = { query: async () => { queried = true; return []; } } as unknown as LocalDatabase;
    const service = new CashDrawerService(db);
    await expect(service.current({ ...cashier, permissions: [] })).rejects.toThrow("Cash drawer permission is required");
    expect(queried).toBe(false);
  });

  it("does not expose another cashier's open drawer", async () => {
    const db = { query: async () => [{ id: "session-1", opened_by_user_id: "cashier-2" }] } as unknown as LocalDatabase;
    await expect(new CashDrawerService(db).current(cashier)).resolves.toBeNull();
  });

  it("requires an open drawer for cash transactions", async () => {
    const db = { query: async () => [] } as unknown as LocalDatabase;
    await expect(requireOpenCashSession(db, cashier.id)).rejects.toThrow("Open the cash drawer");
  });

  it("prevents a cashier from posting into another cashier's drawer", async () => {
    let queryNumber = 0;
    const db = { query: async () => ++queryNumber === 1 ? [{ id: "session-1", opened_by_user_id: "cashier-2" }] : [{ role_name: "CASHIER" }] } as unknown as LocalDatabase;
    await expect(requireOpenCashSession(db, cashier.id)).rejects.toThrow("belongs to another cashier");
  });
});
