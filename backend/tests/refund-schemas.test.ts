import { describe, expect, it } from "vitest";
import { saleRefundSchema, saleVoidSchema } from "../src/modules/sales/refund.schemas.js";

describe("sale reversal schemas", () => {
  it("accepts a reasoned partial refund and a full void request", () => {
    expect(saleRefundSchema.parse({ reason: "Customer returned item", items: [{ saleItemId: "item-1", quantity: 0.5 }] }).items[0].quantity).toBe(0.5);
    expect(saleVoidSchema.parse({ requestKey: "request-123", reason: "Payment entered twice" }).reason).toBe("Payment entered twice");
  });

  it("rejects empty refunds, zero quantities, and missing reversal reasons", () => {
    expect(() => saleRefundSchema.parse({ reason: "Return", items: [] })).toThrow();
    expect(() => saleRefundSchema.parse({ reason: "Return", items: [{ saleItemId: "item-1", quantity: 0 }] })).toThrow();
    expect(() => saleVoidSchema.parse({ reason: "" })).toThrow();
  });
});
