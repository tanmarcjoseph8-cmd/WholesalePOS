import { describe, expect, it } from "vitest";
import { calculateVariableSaleLine, calculateVariableUnitPrice, convertQuantity, convertToBaseQuantity } from "../src/modules/inventory/unit-conversion.js";

describe("variable unit conversion", () => {
  it("converts grams into kilogram base quantity", () => {
    expect(convertToBaseQuantity(2350, "GRAM")).toBe(2.35);
  });

  it("calculates rice sold by kilogram from a per-kilogram base price", () => {
    expect(calculateVariableUnitPrice(60, 2.35, "KILOGRAM")).toBe(141);
  });

  it("converts milliliters into liter inventory quantity", () => {
    expect(convertQuantity(750, "MILLILITER", "LITER")).toBe(0.75);
  });

  it("calculates partial rice sale from a 5kg package price", () => {
    expect(
      calculateVariableSaleLine({
        packagePrice: 300,
        packageSize: 5,
        soldQuantity: 2.5,
        soldUnit: "KILOGRAM",
        inventoryUnit: "KILOGRAM"
      })
    ).toEqual({ baseQuantity: 2.5, unitPrice: 60, lineSubtotal: 150 });
  });

  it("calculates partial oil sale from a 20 liter package price", () => {
    expect(
      calculateVariableSaleLine({
        packagePrice: 2000,
        packageSize: 20,
        soldQuantity: 750,
        soldUnit: "MILLILITER",
        inventoryUnit: "LITER"
      })
    ).toEqual({ baseQuantity: 0.75, unitPrice: 100, lineSubtotal: 75 });
  });
});
