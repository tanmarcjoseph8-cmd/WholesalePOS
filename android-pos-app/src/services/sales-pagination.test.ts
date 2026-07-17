import { describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../data/database";
import { SalesService } from "./sales-service";

describe("SalesService history pagination", () => {
  it("uses bounded stable database pages and payment filters", async () => {
    const query = vi.fn().mockResolvedValue([]);
    const db = { query } as unknown as LocalDatabase;
    const page = await new SalesService(db).listSalesPage({ search: "POS-1", paymentMethod: "CASH", pageSize: 100 });
    expect(page).toEqual({ items: [], nextCursor: null });
    expect(query.mock.calls[0]?.[0]).toContain("ORDER BY s.created_at DESC, s.id DESC LIMIT ?");
    expect(query.mock.calls[0]?.[0]).toContain("EXISTS(SELECT 1 FROM sale_payments");
    expect(query.mock.calls[0]?.[1]?.at(-1)).toBe(101);
  });
});
