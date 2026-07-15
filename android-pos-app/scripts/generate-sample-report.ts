import { mkdir, writeFile } from "node:fs/promises";
import { createSalesReportPdf } from "../src/domain/report-pdf";
import { buildSalesReport, reportRange, type ReportSaleRow, type SalesReportSource } from "../src/domain/reporting";
import type { AppSettings } from "../src/domain/models";

const settings: AppSettings = {
  businessName: "WholesalePOS Sample Store",
  businessMode: "HYBRID",
  currency: "PHP",
  businessTimezone: "Asia/Manila",
  paperWidth: "80mm",
  receiptFooter: "Thank you",
  serviceChargeBasisPoints: 0,
  customOrderTypes: [],
  defaultLowStockThresholdMicro: 5_000_000,
  inventoryNotificationsEnabled: true,
  lowStockNotificationsEnabled: true,
  outOfStockNotificationsEnabled: true,
  inventoryNotificationSound: true,
  darkMode: false
};

const sales: ReportSaleRow[] = Array.from({ length: 32 }, (_, index) => ({
  id: `sample-sale-${index}`,
  receiptNumber: `POS-${String(index + 1).padStart(6, "0")}`,
  orderNumber: index % 3 === 0 ? `ORD-${String(index + 1).padStart(6, "0")}` : null,
  orderType: index % 3 === 0 ? "DINE_IN" : index % 3 === 1 ? "TAKEOUT" : "RETAIL",
  customOrderType: null,
  tableNumber: index % 3 === 0 ? String(index % 10 + 1) : null,
  status: "COMPLETED",
  subtotalCents: 12_000 + index * 125,
  discountCents: index % 4 === 0 ? 500 : 0,
  taxCents: 1_380,
  serviceChargeCents: index % 3 === 0 ? 600 : 0,
  tipCents: 0,
  grandTotalCents: 13_380 + index * 125 - (index % 4 === 0 ? 500 : 0) + (index % 3 === 0 ? 600 : 0),
  createdAt: new Date(Date.UTC(2026, 6, 16, 0, index)).toISOString()
}));

const source: SalesReportSource = {
  sales,
  items: sales.map((sale, index) => ({ saleId: sale.id, saleStatus: sale.status, productId: `product-${index % 6}`, sku: `SKU-${index % 6}`, productName: ["Bottled Water", "Premium Rice", "Steel Bar", "Cooking Oil", "Chicken Meal", "Laundry Soap"][index % 6] ?? "Product", soldUnit: index % 2 ? "PIECE" : "KILOGRAM", soldQuantityMicro: (index % 4 + 1) * 1_000_000, lineTotalCents: sale.grandTotalCents, refundedQuantityMicro: 0, refundedLineTotalCents: 0 })),
  payments: sales.map((sale, index) => ({ saleId: sale.id, saleStatus: sale.status, method: index % 3 === 0 ? "GCASH" : "CASH", amountCents: sale.grandTotalCents })),
  refunds: [],
  refundPayments: []
};

const report = buildSalesReport(source, reportRange("TODAY", settings.businessTimezone, null, new Date("2026-07-16T03:00:00Z")), "2026-07-16T04:00:00Z");
const pdf = createSalesReportPdf(report, settings, { detailed: true });
await mkdir("docs", { recursive: true });
await writeFile("docs/sample-sales-report.pdf", pdf.bytes);
process.stdout.write(`Created docs/sample-sales-report.pdf (${pdf.pageCount} pages)\n`);
