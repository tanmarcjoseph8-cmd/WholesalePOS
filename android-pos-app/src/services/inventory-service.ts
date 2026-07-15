import type { LocalDatabase } from "../data/database";
import { createId, nowIso, type LocalUser } from "../domain/models";
import { audit } from "./service-helpers";

export type StockMovementInput = {
  productId: string;
  warehouseId?: string;
  type: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
  quantityMicro: number;
  unitCostCents?: number | null;
  reason: string;
};

export class InventoryService {
  constructor(private db: LocalDatabase) {}

  async moveStock(actor: LocalUser, input: StockMovementInput) {
    if (!actor.permissions.includes("*") && !actor.permissions.includes("inventory.manage")) throw new Error("Inventory management permission is required.");
    if (!Number.isSafeInteger(input.quantityMicro) || input.quantityMicro < 0) throw new Error("Enter a valid stock quantity.");
    if (input.reason.trim().length < 3) throw new Error("A stock movement reason is required.");
    const warehouseId = input.warehouseId ?? "warehouse_main";
    const movementId = createId("movement");
    await this.db.transaction(async () => {
      const rows = await this.db.query<{ quantity_micro: number }>("SELECT quantity_micro FROM inventory_stock WHERE product_id=? AND warehouse_id=?", [input.productId, warehouseId]);
      const current = Number(rows[0]?.quantity_micro ?? 0);
      const next = input.type === "ADJUSTMENT" ? input.quantityMicro : input.type === "STOCK_IN" ? current + input.quantityMicro : current - input.quantityMicro;
      if (next < 0) throw new Error("This movement would make stock negative.");
      const delta = next - current;
      if (delta === 0) throw new Error("The stock quantity is already at that value.");
      const now = nowIso();
      await this.db.run(
        `INSERT INTO inventory_stock(product_id, warehouse_id, quantity_micro, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity_micro=excluded.quantity_micro, updated_at=excluded.updated_at`,
        [input.productId, warehouseId, next, now],
        false
      );
      await this.db.run(
        "INSERT INTO inventory_movements(id, product_id, warehouse_id, type, quantity_micro, unit_cost_cents, reason, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [movementId, input.productId, warehouseId, input.type, delta, input.unitCostCents ?? null, input.reason.trim(), actor.id, now],
        false
      );
      await audit(this.db, { actorId: actor.id, action: "INVENTORY_CHANGED", entityType: "InventoryMovement", entityId: movementId, reason: input.reason, metadata: { productId: input.productId, previousMicro: current, nextMicro: next } });
    });
  }

  async listMovements(limit = 200) {
    return this.db.query<{
      id: string;
      product_name: string;
      type: string;
      quantity_micro: number;
      reason: string;
      created_at: string;
    }>(
      `SELECT m.id, p.name AS product_name, m.type, m.quantity_micro, m.reason, m.created_at
       FROM inventory_movements m JOIN products p ON p.id=m.product_id ORDER BY m.created_at DESC LIMIT ?`,
      [Math.min(Math.max(limit, 1), 1000)]
    );
  }
}

