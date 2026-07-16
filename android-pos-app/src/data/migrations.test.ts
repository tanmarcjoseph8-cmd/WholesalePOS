import { describe, expect, it } from "vitest";
import { currentSchemaVersion, migrations } from "./migrations";

describe("offline database migrations", () => {
  const sql = migrations.map((migration) => migration.sql).join("\n").toLowerCase();

  it("uses ordered, non-destructive migration versions", () => {
    expect(migrations.map((migration) => migration.version)).toEqual([1, 2, 3, 4, 5]);
    expect(currentSchemaVersion).toBe(5);
    expect(sql).not.toMatch(/\bdrop\s+(table|column|index)\b/);
  });

  it("contains all operational and audit tables", () => {
    const required = [
      "users", "products", "inventory_stock", "inventory_movements", "restaurant_tables", "orders",
      "order_items", "inventory_reservations", "sales", "sale_items", "sale_payments", "refunds",
      "refund_items", "audit_logs", "settings", "import_batches", "inventory_alert_state", "inventory_alerts", "cash_sessions", "cash_movements"
    ];
    for (const table of required) expect(sql).toContain(`create table if not exists ${table}`);
  });

  it("enforces one open drawer and idempotent cash writes", () => {
    expect(sql).toContain("cash_sessions_one_open_register_idx");
    expect(sql).toContain("where status='open'");
    expect(sql).toMatch(/create table if not exists cash_sessions \([\s\S]*?request_key text not null unique/);
    expect(sql).toMatch(/create table if not exists cash_movements \([\s\S]*?request_key text not null unique/);
    expect(sql).toContain("cash_movements_sale_once_idx");
    expect(sql).toContain("cash_movements_refund_once_idx");
  });

  it("gives cashiers read-only alerts without inventory access", () => {
    const cashierUpdates = [...sql.matchAll(/update roles set permissions_json='([^']+)' where id='role_cashier'/g)];
    const cashierUpdate = cashierUpdates[cashierUpdates.length - 1]?.[1] ?? "";
    expect(cashierUpdate).toContain("cash_drawer.use");
    expect(cashierUpdate).toContain("inventory.alerts.view");
    expect(cashierUpdate).not.toContain("inventory.view");
    expect(cashierUpdate).not.toContain("inventory.manage");
  });

  it("enforces idempotent sale, order, refund, and import requests", () => {
    for (const table of ["orders", "sales", "refunds", "import_batches"]) {
      expect(sql).toMatch(new RegExp(`create table if not exists ${table} \\([\\s\\S]*?request_key text not null unique`));
    }
  });

  it("indexes inventory, active orders, sales, and audit history", () => {
    for (const index of ["inventory_movements_product_idx", "reservations_stock_idx", "orders_status_idx", "sales_created_idx", "audit_entity_idx", "inventory_alerts_unread_idx"]) {
      expect(sql).toContain(`index if not exists ${index}`);
    }
  });
});
