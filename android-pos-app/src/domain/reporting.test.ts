import { describe, expect, it } from "vitest";
import { buildSalesReport, reportRange, type ReportSaleRow, type SalesReportSource } from "./reporting";

const now = new Date("2026-07-16T03:00:00.000Z");

function sale(overrides: Partial<ReportSaleRow> = {}): ReportSaleRow {
  return {
    id: "sale-1",
    receiptNumber: "POS-000001",
    orderNumber: null,
    orderType: "RETAIL",
    customOrderType: null,
    tableNumber: null,
    status: "COMPLETED",
    subtotalCents: 10_000,
    discountCents: 1_000,
    taxCents: 1_080,
    serviceChargeCents: 0,
    tipCents: 0,
    grandTotalCents: 10_080,
    createdAt: "2026-07-16T02:00:00.000Z",
    ...overrides
  };
}

function source(): SalesReportSource {
  return {
    sales: [
      sale(),
      sale({ id: "sale-2", receiptNumber: "POS-000002", orderType: "DINE_IN", tableNumber: "4", status: "REFUNDED", subtotalCents: 5_000, discountCents: 0, taxCents: 600, grandTotalCents: 5_600 }),
      sale({ id: "sale-3", receiptNumber: "POS-000003", status: "VOIDED", subtotalCents: 2_000, discountCents: 0, taxCents: 240, grandTotalCents: 2_240 }),
      sale({ id: "sale-4", receiptNumber: "POS-000004", status: "PENDING", subtotalCents: 9_000, discountCents: 0, taxCents: 1_080, grandTotalCents: 10_080 })
    ],
    items: [
      { saleId: "sale-1", saleStatus: "COMPLETED", productId: "water", sku: "WATER", productName: "Water", soldUnit: "PIECE", soldQuantityMicro: 2_000_000, lineTotalCents: 10_080, refundedQuantityMicro: 0, refundedLineTotalCents: 0 },
      { saleId: "sale-2", saleStatus: "REFUNDED", productId: "rice", sku: "RICE", productName: "Rice", soldUnit: "KILOGRAM", soldQuantityMicro: 1_000_000, lineTotalCents: 5_600, refundedQuantityMicro: 1_000_000, refundedLineTotalCents: 5_600 },
      { saleId: "sale-3", saleStatus: "VOIDED", productId: "void", sku: "VOID", productName: "Voided", soldUnit: "PIECE", soldQuantityMicro: 1_000_000, lineTotalCents: 2_240, refundedQuantityMicro: 1_000_000, refundedLineTotalCents: 2_240 },
      { saleId: "sale-4", saleStatus: "PENDING", productId: "unpaid", sku: "UNPAID", productName: "Unpaid", soldUnit: "PIECE", soldQuantityMicro: 1_000_000, lineTotalCents: 10_080, refundedQuantityMicro: 0, refundedLineTotalCents: 0 }
    ],
    payments: [
      { saleId: "sale-1", saleStatus: "COMPLETED", method: "CASH", amountCents: 10_080 },
      { saleId: "sale-2", saleStatus: "REFUNDED", method: "GCASH", amountCents: 5_600 },
      { saleId: "sale-3", saleStatus: "VOIDED", method: "CASH", amountCents: 2_240 },
      { saleId: "sale-4", saleStatus: "PENDING", method: "CASH", amountCents: 10_080 }
    ],
    refunds: [
      { id: "refund-1", saleId: "sale-2", saleStatus: "REFUNDED", kind: "REFUND", grandTotalCents: 5_600 },
      { id: "void-1", saleId: "sale-3", saleStatus: "VOIDED", kind: "VOID", grandTotalCents: 2_240 }
    ],
    refundPayments: [
      { refundId: "refund-1", saleId: "sale-2", saleStatus: "REFUNDED", kind: "REFUND", method: "GCASH", amountCents: 5_600 },
      { refundId: "void-1", saleId: "sale-3", saleStatus: "VOIDED", kind: "VOID", method: "CASH", amountCents: 2_240 }
    ]
  };
}

describe("business-timezone report ranges", () => {
  it("builds daily, weekly, and monthly ranges with Monday as week start", () => {
    expect(reportRange("TODAY", "Asia/Manila", null, now)).toMatchObject({ fromDate: "2026-07-16", toDate: "2026-07-16", startIso: "2026-07-15T16:00:00.000Z", endExclusiveIso: "2026-07-16T16:00:00.000Z" });
    expect(reportRange("THIS_WEEK", "Asia/Manila", null, now)).toMatchObject({ fromDate: "2026-07-13", toDate: "2026-07-19" });
    expect(reportRange("THIS_MONTH", "Asia/Manila", null, now)).toMatchObject({ fromDate: "2026-07-01", toDate: "2026-07-31" });
  });

  it("builds previous and custom ranges", () => {
    expect(reportRange("PREVIOUS_DAY", "Asia/Manila", null, now)).toMatchObject({ fromDate: "2026-07-15", toDate: "2026-07-15" });
    expect(reportRange("PREVIOUS_WEEK", "Asia/Manila", null, now)).toMatchObject({ fromDate: "2026-07-06", toDate: "2026-07-12" });
    expect(reportRange("PREVIOUS_MONTH", "Asia/Manila", null, now)).toMatchObject({ fromDate: "2026-06-01", toDate: "2026-06-30" });
    expect(reportRange("CUSTOM", "Asia/Manila", { fromDate: "2026-05-02", toDate: "2026-05-09" }, now)).toMatchObject({ fromDate: "2026-05-02", toDate: "2026-05-09" });
    expect(() => reportRange("CUSTOM", "Asia/Manila", { fromDate: "2026-05-10", toDate: "2026-05-09" }, now)).toThrow("valid custom");
  });
});

describe("offline sales report calculations", () => {
  it("calculates discounts, taxes, refunds, voids, and net totals without counting voided sales", () => {
    const report = buildSalesReport(source(), reportRange("TODAY", "Asia/Manila", null, now), now.toISOString());
    expect(report.summary).toMatchObject({ grossSalesCents: 15_000, discountCents: 1_000, taxCents: 1_680, refundCents: 5_600, voidCents: 2_240, netSalesCents: 10_080, transactionCount: 2, averageTransactionCents: 5_040, cashSalesCents: 10_080 });
    expect(report.transactions.find((entry) => entry.id === "sale-3")).toMatchObject({ status: "VOIDED", netCents: 0 });
  });

  it("calculates payment, order-type, and best-seller breakdowns net of refunds", () => {
    const report = buildSalesReport(source(), reportRange("TODAY", "Asia/Manila", null, now));
    expect(report.payments).toEqual([{ method: "CASH", amountCents: 10_080 }, { method: "GCASH", amountCents: 0 }]);
    expect(report.orderTypes).toEqual([
      { orderType: "RETAIL", transactionCount: 1, netSalesCents: 10_080 },
      { orderType: "DINE_IN", transactionCount: 1, netSalesCents: 0 }
    ]);
    expect(report.bestSellers).toEqual([{ productId: "water", sku: "WATER", name: "Water", soldUnit: "PIECE", quantityMicro: 2_000_000, salesCents: 10_080 }]);
  });

  it("uses only finalized sale rows and remains fully offline", () => {
    const report = buildSalesReport(source(), reportRange("THIS_MONTH", "Asia/Manila", null, now));
    expect(report.localDataOnly).toBe(true);
    expect(report.summary.transactionCount).toBe(2);
    expect(report.transactions.some((transaction) => transaction.id === "sale-4")).toBe(false);
    expect(report.bestSellers.some((product) => product.productId === "unpaid")).toBe(false);
  });
});
