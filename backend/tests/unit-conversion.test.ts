import { describe, expect, it } from "vitest";
import { calculateVariableUnitPrice, convertToBaseQuantity } from "../src/modules/inventory/unit-conversion.js";

describe("variable unit conversion", () => {
  it("converts grams into kilogram base quantity", () => {
    expect(convertToBaseQuantity(2350, "GRAM")).toBe(2.35);
  });

  it("calculates rice sold by kilogram from a per-kilogram base price", () => {
    expect(calculateVariableUnitPrice(60, 2.35, "KILOGRAM")).toBe(141);
  });
});
