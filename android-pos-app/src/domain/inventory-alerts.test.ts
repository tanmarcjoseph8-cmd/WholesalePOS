import { describe, expect, it } from "vitest";
import { effectiveStockThreshold, shouldCreateStockAlert, stockAlertStatus } from "./inventory-alerts";

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
});
