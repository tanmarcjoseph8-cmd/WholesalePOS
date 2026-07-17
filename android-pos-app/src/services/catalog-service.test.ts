import { describe, expect, it, vi } from "vitest";
import { CatalogService, normalizeBarcode } from "./catalog-service";
import type { LocalDatabase } from "../data/database";

function databaseReturning(rows: object[] = []) {
  return { query: vi.fn().mockResolvedValue(rows) } as unknown as LocalDatabase;
}

describe("CatalogService scalable lookup", () => {
  it("normalizes scanner whitespace", () => {
    expect(normalizeBarcode(" 4801234567890\r\n")).toBe("4801234567890");
  });

  it("uses exact indexed barcode equality without wildcard input", async () => {
    const db = databaseReturning();
    await new CatalogService(db).findByBarcode(" 12345 ");
    const query = vi.mocked(db.query).mock.calls[0];
    expect(query?.[0]).toContain("exact_barcode.value=?");
    expect(query?.[0]).not.toContain("exact_barcode.value LIKE");
    expect(query?.[1]).toEqual(["12345"]);
  });

  it("bounds page size and returns a stable continuation cursor", async () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      id: `p${index}`, sku: `S${index}`, barcode: null, name: `Product ${String(index).padStart(2, "0")}`,
      category_id: null, category_name: null, inventory_unit: "PIECE", selling_unit: "PIECE",
      unit_ratio_micro: 1_000_000, package_size_micro: 1_000_000, cost_price_cents: 0,
      retail_price_cents: 100, wholesale_price_cents: 90, wholesale_threshold_micro: 0,
      tax_basis_points: 0, minimum_stock_micro: 0, status: "ACTIVE", stock_micro: 1_000_000,
      reserved_micro: 0, available_micro: 1_000_000, thumbnail_path: null,
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z"
    }));
    const db = databaseReturning(rows);
    const page = await new CatalogService(db).listProductPage({ pageSize: 10 });
    expect(page.items).toHaveLength(10);
    expect(page.items[0]?.thumbnailPath).toBeNull();
    expect(page.nextCursor).toBeTruthy();
    expect(vi.mocked(db.query).mock.calls[0]?.[1]?.at(-1)).toBe(11);
  });
});
