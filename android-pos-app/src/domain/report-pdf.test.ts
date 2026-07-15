import { describe, expect, it } from "vitest";
import type { AppSettings } from "./models";
import { createSalesReportPdf } from "./report-pdf";
import { buildSalesReport, reportRange, type ReportSaleRow, type SalesReportSource } from "./reporting";
import { ReportPdfService } from "../services/report-pdf-service";
import type { FileService } from "../platform/file-service";

const settings: AppSettings = {
  businessName: "Test Wholesale",
  businessMode: "HYBRID",
  currency: "PHP",
  businessTimezone: "Asia/Manila",
  paperWidth: "80mm",
  receiptFooter: "Thank you",
  serviceChargeBasisPoints: 0,
  customOrderTypes: [],
  defaultLowStockThresholdMicro: 0,
  inventoryNotificationsEnabled: true,
  lowStockNotificationsEnabled: true,
  outOfStockNotificationsEnabled: true,
  inventoryNotificationSound: true,
  darkMode: false
};

function reportWithTransactions(count: number) {
  const sales: ReportSaleRow[] = Array.from({ length: count }, (_, index) => ({
    id: `sale-${index}`,
    receiptNumber: `POS-${String(index + 1).padStart(6, "0")}`,
    orderNumber: null,
    orderType: index % 2 ? "DINE_IN" : "RETAIL",
    customOrderType: null,
    tableNumber: index % 2 ? String(index % 12 + 1) : null,
    status: "COMPLETED",
    subtotalCents: 10_000,
    discountCents: 500,
    taxCents: 1_140,
    serviceChargeCents: 0,
    tipCents: 0,
    grandTotalCents: 10_640,
    createdAt: new Date(Date.UTC(2026, 6, 16, 1, index % 60)).toISOString()
  }));
  const source: SalesReportSource = {
    sales,
    items: sales.map((sale, index) => ({ saleId: sale.id, saleStatus: sale.status, productId: `p-${index % 4}`, sku: `SKU-${index % 4}`, productName: `Product ${index % 4}`, soldUnit: "PIECE", soldQuantityMicro: 1_000_000, lineTotalCents: sale.grandTotalCents, refundedQuantityMicro: 0, refundedLineTotalCents: 0 })),
    payments: sales.map((sale) => ({ saleId: sale.id, saleStatus: sale.status, method: "CASH", amountCents: sale.grandTotalCents })),
    refunds: [],
    refundPayments: []
  };
  return buildSalesReport(source, reportRange("TODAY", "Asia/Manila", null, new Date("2026-07-16T03:00:00Z")));
}

describe("A4 sales report PDF", () => {
  it("creates a readable PDF for one transaction", () => {
    const result = createSalesReportPdf(reportWithTransactions(1), settings, { detailed: true });
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(new TextDecoder().decode(result.bytes.slice(0, 4))).toBe("%PDF");
    expect(result.bytes.byteLength).toBeGreaterThan(2_000);
  });

  it("paginates a long detailed transaction report", () => {
    const result = createSalesReportPdf(reportWithTransactions(90), settings, { detailed: true });
    expect(result.pageCount).toBeGreaterThan(2);
    expect(result.bytes.byteLength).toBeGreaterThan(10_000);
  });

  it("writes and shares a generated report through the device file service", async () => {
    const writes: Array<{ fileName: string; data: string; base64?: boolean }> = [];
    const shares: Array<{ fileName: string; uri: string; dialogTitle: string }> = [];
    const files = {
      writeCacheFile: async (input: { fileName: string; data: string; base64?: boolean }) => {
        writes.push(input);
        return { uri: "file:///cache/report.pdf", webPath: "capacitor://localhost/cache/report.pdf" };
      },
      shareFile: async (input: { fileName: string; uri: string; dialogTitle: string }) => { shares.push(input); }
    } as FileService;
    const service = new ReportPdfService(files);

    const file = await service.create(reportWithTransactions(1), settings, true);
    await service.share(file.fileName, file.uri);

    expect(writes).toHaveLength(1);
    expect(writes[0]?.base64).toBe(true);
    expect(writes[0]?.fileName).toMatch(/^sales-report-.*-detailed\.pdf$/);
    expect(writes[0]?.data.length).toBeGreaterThan(2_000);
    expect(shares).toEqual([{ fileName: file.fileName, uri: file.uri, dialogTitle: "Save, share, or print sales report" }]);
  });
});
