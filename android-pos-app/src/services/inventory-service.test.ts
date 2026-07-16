import { describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../data/database";
import { InventoryService } from "./inventory-service";

describe("InventoryService product activity", () => {
  it("combines product lifecycle and stock movement rows into tracker records", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        activity_id: "audit_1",
        kind: "PRODUCT",
        action: "PRODUCT_CREATED",
        product_id: "product_1",
        product_name: "Steel bar",
        inventory_unit: "METER",
        quantity_micro: null,
        actor_name: "Owner",
        reason: null,
        reference_type: null,
        created_at: "2026-07-16T01:00:00.000Z"
      },
      {
        activity_id: "movement_1",
        kind: "STOCK",
        action: "SALE",
        product_id: "product_1",
        product_name: "Steel bar",
        inventory_unit: "METER",
        quantity_micro: -2_500_000,
        actor_name: "Cashier",
        reason: "Sale R-0001",
        reference_type: "Sale",
        created_at: "2026-07-16T02:00:00.000Z"
      }
    ]);
    const service = new InventoryService({ query } as unknown as LocalDatabase);

    const activity = await service.listProductActivity(2_000);

    expect(query).toHaveBeenCalledWith(expect.stringContaining("UNION ALL"), [1_000]);
    expect(activity).toEqual([
      expect.objectContaining({ id: "audit_1", kind: "PRODUCT", productName: "Steel bar", quantityMicro: null }),
      expect.objectContaining({ id: "movement_1", kind: "STOCK", action: "SALE", quantityMicro: -2_500_000, actorName: "Cashier" })
    ]);
  });
});
