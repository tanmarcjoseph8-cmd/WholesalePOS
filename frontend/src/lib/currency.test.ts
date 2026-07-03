import { describe, expect, it } from "vitest";
import { formatCurrency } from "./currency";

describe("formatCurrency", () => {
  it("formats Philippine peso amounts for receipts and totals", () => {
    expect(formatCurrency(141)).toBe("₱141.00");
  });

  it("preserves decimal precision for tax and discount values", () => {
    expect(formatCurrency(99.5)).toBe("₱99.50");
  });
});
