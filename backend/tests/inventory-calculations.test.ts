import { describe, expect, it } from "vitest";
import { calculateAdjustmentDelta, calculateNextStock } from "../src/modules/inventory/inventory-calculations.js";

describe("inventory calculations", () => {
  it("increases and decreases stock with six-decimal precision", () => {
    expect(calculateNextStock(10, 2.345678, "INCREASE")).toBe(12.345678);
    expect(calculateNextStock(10, 2.345678, "DECREASE")).toBe(7.654322);
  });

  it("rejects movements that would make stock negative", () => {
    expect(() => calculateNextStock(1, 2, "DECREASE")).toThrow("Inventory quantity cannot become negative.");
  });

  it("calculates count adjustment deltas", () => {
    expect(calculateAdjustmentDelta(7.5, 10)).toBe(2.5);
    expect(calculateAdjustmentDelta(7.5, 5)).toBe(-2.5);
  });
});
