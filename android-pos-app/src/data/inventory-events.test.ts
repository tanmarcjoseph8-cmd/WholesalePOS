import { describe, expect, it } from "vitest";
import { isInventoryMutationSql } from "./database";

describe("live inventory change detection", () => {
  it("observes sale, refund, manual, import, reservation, and threshold writes", () => {
    expect(isInventoryMutationSql("UPDATE inventory_stock SET quantity_micro=quantity_micro-? WHERE product_id=?")).toBe(true);
    expect(isInventoryMutationSql("INSERT INTO inventory_stock(product_id, warehouse_id) VALUES (?, ?)")).toBe(true);
    expect(isInventoryMutationSql("UPDATE inventory_reservations SET status='RELEASED'")).toBe(true);
    expect(isInventoryMutationSql("INSERT INTO inventory_reservations(id) VALUES (?)")).toBe(true);
    expect(isInventoryMutationSql("UPDATE products SET minimum_stock_micro=? WHERE id=?")).toBe(true);
    expect(isInventoryMutationSql("UPDATE settings SET value_json=? WHERE key='app'")).toBe(true);
  });

  it("ignores report and audit writes", () => {
    expect(isInventoryMutationSql("SELECT * FROM inventory_stock")).toBe(false);
    expect(isInventoryMutationSql("INSERT INTO audit_logs(id) VALUES (?)")).toBe(false);
    expect(isInventoryMutationSql("UPDATE sales SET status='VOIDED'")).toBe(false);
    expect(isInventoryMutationSql("UPDATE inventory_alerts SET resolved_at=? WHERE EXISTS (SELECT 1 FROM products)")).toBe(false);
  });
});
