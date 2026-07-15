import { describe, expect, it } from "vitest";
import { currentSchemaVersion, migrations } from "./migrations";

describe("offline database migrations", () => {
  const sql = migrations.map((migration) => migration.sql).join("\n").toLowerCase();

  it("uses ordered, non-destructive migration versions", () => {
    expect(migrations.map((migration) => migration.version)).toEqual([1, 2]);
    expect(currentSchemaVersion).toBe(2);
    expect(sql).not.toMatch(/\bdrop\s+(table|column|index)\b/);
  });

  it("contains all operational and audit tables", () => {
    const required = [
      "users", "products", "inventory_stock", "inventory_movements", "restaurant_tables", "orders",
      "order_items", "inventory_reservations", "sales", "sale_items", "sale_payments", "refunds",
      "refund_items", "audit_logs", "settings", "import_batches"
    ];
    for (const table of required) expect(sql).toContain(`create table if not exists ${table}`);
  });

  it("enforces idempotent sale, order, refund, and import requests", () => {
    for (const table of ["orders", "sales", "refunds", "import_batches"]) {
      expect(sql).toMatch(new RegExp(`create table if not exists ${table} \\([\\s\\S]*?request_key text not null unique`));
    }
  });

  it("indexes inventory, active orders, sales, and audit history", () => {
    for (const index of ["inventory_movements_product_idx", "reservations_stock_idx", "orders_status_idx", "sales_created_idx", "audit_entity_idx"]) {
      expect(sql).toContain(`index if not exists ${index}`);
    }
  });
});
