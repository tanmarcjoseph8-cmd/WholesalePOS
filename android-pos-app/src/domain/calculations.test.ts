import { describe, expect, it } from "vitest";
import { assertSufficientPayment, lineTotals, saleTotals, toBaseQuantity } from "./calculations";
import { toMicro, type CartLine } from "./models";

const line: CartLine = {
  productId: "product",
  name: "Rice",
  soldQuantityMicro: toMicro(2.5),
  soldUnit: "KILOGRAM",
  baseQuantityMicro: toMicro(2.5),
  unitPriceCents: 6_000,
  discountCents: 500,
  taxBasisPoints: 1_200
};

describe("offline sale calculations", () => {
  it("converts fractional sold quantities to base inventory", () => {
    expect(toBaseQuantity(toMicro(2.5), toMicro(1))).toBe(toMicro(2.5));
    expect(toBaseQuantity(toMicro(1), toMicro(0.9144))).toBe(toMicro(0.9144));
  });

  it("uses integer centavos for totals", () => {
    expect(lineTotals(line)).toEqual({ grossCents: 15_000, discountCents: 500, taxCents: 1_740, totalCents: 16_240 });
    expect(saleTotals([line], 1_000, 200).grandTotalCents).toBe(17_440);
  });

  it("rejects underpayment and calculates change", () => {
    expect(() => assertSufficientPayment(100, 101)).toThrow("Payment total is less");
    expect(assertSufficientPayment(20_000, 17_440)).toBe(2_560);
  });
});

