import { describe, expect, it } from "vitest";
import { denominationTotal, expectedCash, netCashReceived, phpDenominations } from "./cash-drawer";

describe("cash drawer calculations", () => {
  it("reconciles opening cash, net sales, refunds, cash in, and cash out", () => {
    expect(expectedCash({ openingCashCents: 10_000, cashSalesCents: 8_500, cashRefundsCents: 1_000, cashInCents: 2_000, cashOutCents: 500 })).toBe(19_000);
  });

  it("records only cash retained after customer change", () => {
    expect(netCashReceived(10_000, 6_000)).toBe(4_000);
    expect(netCashReceived(2_000, 0)).toBe(2_000);
    expect(netCashReceived(2_000, 3_000)).toBe(0);
  });

  it("counts bills and coins without floating point arithmetic", () => {
    const counts = phpDenominations.map((item) => ({ ...item, quantity: item.key === "bill_1000" ? 2 : item.key === "coin_025" ? 3 : 0 }));
    expect(denominationTotal(counts)).toBe(200_075);
  });

  it("includes signed manager corrections", () => {
    expect(expectedCash({ openingCashCents: 5_000, cashSalesCents: 0, cashRefundsCents: 0, cashInCents: 0, cashOutCents: 0, correctionsCents: -500 })).toBe(4_500);
  });
});
