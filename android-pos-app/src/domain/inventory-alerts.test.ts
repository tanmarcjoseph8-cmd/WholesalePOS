import { describe, expect, it } from "vitest";
import { effectiveStockThreshold, inventoryAlertMessage, shouldCreateStockAlert, stockAlertStatus } from "./inventory-alerts";

describe("inventory alert transitions", () => {
  it("classifies decimal stock using micro quantities", () => {
    expect(stockAlertStatus(4_500_000, 5_000_000)).toBe("LOW_STOCK");
    expect(stockAlertStatus(5_000_001, 5_000_000)).toBe("NORMAL");
    expect(stockAlertStatus(0, 5_000_000)).toBe("OUT_OF_STOCK");
  });

  it("deduplicates an unchanged state and alerts again after restocking", () => {
    expect(shouldCreateStockAlert("NORMAL", "LOW_STOCK")).toBe(true);
    expect(shouldCreateStockAlert("LOW_STOCK", "LOW_STOCK")).toBe(false);
    expect(shouldCreateStockAlert("LOW_STOCK", "OUT_OF_STOCK")).toBe(true);
    expect(shouldCreateStockAlert("OUT_OF_STOCK", "NORMAL")).toBe(false);
    expect(shouldCreateStockAlert("NORMAL", "LOW_STOCK")).toBe(true);
  });

  it("uses a product threshold before the optional default", () => {
    expect(effectiveStockThreshold(3_000_000, 5_000_000)).toBe(3_000_000);
    expect(effectiveStockThreshold(0, 5_000_000)).toBe(5_000_000);
  });

  it("names affected products and quantities in the in-app alert", () => {
    const base = { id: "a1", productId: "p1", warehouseId: "w1", warehouseName: "Main", inventoryUnit: "PIECE" as const, thresholdMicro: 5_000_000, isRead: false, isResolved: false, createdAt: "2026-07-16T00:00:00.000Z" };
    expect(inventoryAlertMessage([
      { ...base, productName: "Bottled Water", alertType: "LOW_STOCK", currentQuantityMicro: 4_000_000 },
      { ...base, id: "a2", productId: "p2", productName: "Chicken Meal", alertType: "OUT_OF_STOCK", currentQuantityMicro: 0 }
    ])).toBe("Stock alerts: Bottled Water (4 piece left); Chicken Meal (out of stock).");
  });
});
