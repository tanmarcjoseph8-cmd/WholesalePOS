import { describe, expect, it } from "vitest";
import {
  restaurantOrderCheckoutSchema,
  restaurantOrderCreateSchema,
  restaurantOrderMergeSchema,
  restaurantOrderSplitSchema,
  restaurantOrderTableAssignmentSchema,
  restaurantOrderUpdateSchema,
  restaurantTableCreateSchema
} from "../src/modules/restaurant/restaurant.schemas.js";

describe("restaurant schemas", () => {
  it("accepts dine-in orders with joined tables and item notes", () => {
    const order = restaurantOrderCreateSchema.parse({
      orderType: "DINE_IN",
      primaryTableId: "table-1",
      tableIds: ["table-1", "table-2"],
      guestCount: 6,
      items: [{ productId: "product-1", warehouseId: "warehouse-1", quantity: 2, soldUnit: "PIECE", discount: 0, note: "No onions" }]
    });
    expect(order).toMatchObject({ orderType: "DINE_IN", guestCount: 6, tableIds: ["table-1", "table-2"] });
    expect(order.items[0]?.note).toBe("No onions");
  });

  it("requires a label for configurable other order types", () => {
    expect(restaurantOrderCreateSchema.parse({ orderType: "OTHER", customOrderType: "Curbside", guestCount: 1 }).customOrderType).toBe("Curbside");
    expect(() => restaurantOrderCreateSchema.parse({ orderType: "OTHER", guestCount: 1 })).toThrow();
  });

  it("validates table capacity, optimistic versions, and payment amounts", () => {
    expect(() => restaurantTableCreateSchema.parse({ number: "1", section: "Main", capacity: 0 })).toThrow();
    expect(() => restaurantOrderTableAssignmentSchema.parse({ expectedVersion: 0, tableIds: [], primaryTableId: "table-1" })).toThrow();
    expect(() => restaurantOrderCheckoutSchema.parse({ expectedVersion: 1, payments: [{ method: "CASH", amount: 0 }] })).toThrow();
  });

  it("validates confirmed reservations, merges, and quantity-based splits", () => {
    expect(restaurantOrderUpdateSchema.parse({ expectedVersion: 2, status: "CONFIRMED" }).status).toBe("CONFIRMED");
    expect(restaurantOrderMergeSchema.parse({ expectedVersion: 2, sourceOrderId: "order-2", sourceExpectedVersion: 3, reason: "Same party" }).sourceOrderId).toBe("order-2");
    expect(restaurantOrderSplitSchema.parse({ expectedVersion: 2, reason: "Separate bills", items: [{ itemId: "item-1", quantity: 0.5 }] }).items[0].quantity).toBe(0.5);
    expect(() => restaurantOrderSplitSchema.parse({ expectedVersion: 2, reason: "Separate bills", items: [] })).toThrow();
  });
});
