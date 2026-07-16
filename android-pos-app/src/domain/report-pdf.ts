import { jsPDF } from "jspdf";
import { formatQuantity, type AppSettings } from "./models";
import { reportPresetLabel, type SalesReport } from "./reporting";

export type SalesReportPdfOptions = { detailed: boolean };

function formatPdfMoney(cents: number) {
  return `PHP ${(cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function displayDate(value: string, timezone: string, withTime = false) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(new Date(value));
}

export function createSalesReportPdf(report: SalesReport, settings: AppSettings, options: SalesReportPdfOptions) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const footerTop = pageHeight - 14;
  let y = margin;

  const addPage = () => {
    doc.addPage();
    y = margin;
  };
  const ensure = (height: number) => {
    if (y + height > footerTop) addPage();
  };
  const sectionTitle = (title: string) => {
    ensure(12);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(23, 107, 84);
    doc.text(title, margin, y);
    doc.setDrawColor(215, 222, 230);
    doc.line(margin, y + 2, pageWidth - margin, y + 2);
    doc.setTextColor(23, 32, 42);
    y += 8;
  };
  const keyValue = (label: string, value: string, row = true) => {
    ensure(6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(value, pageWidth - margin, y, { align: "right" });
    y += row ? 5 : 0;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(settings.businessName, margin, y);
  y += 7;
  doc.setFontSize(13);
  doc.text(`${reportPresetLabel(report.range.preset)} Sales Report`, margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(99, 112, 131);
  doc.text(`${report.range.fromDate} to ${report.range.toDate} (${report.range.timezone})`, margin, y);
  y += 4;
  doc.text(`Generated ${displayDate(report.generatedAt, report.range.timezone, true)} | Local tablet data`, margin, y);
  doc.setTextColor(23, 32, 42);
  y += 8;

  sectionTitle("Sales summary");
  const summaryRows: Array<[string, string]> = [
    ["Gross sales", formatPdfMoney(report.summary.grossSalesCents)],
    ["Discounts", formatPdfMoney(report.summary.discountCents)],
    ["Taxes", formatPdfMoney(report.summary.taxCents)],
    ["Refunds", formatPdfMoney(report.summary.refundCents)],
    ["Voids (shown separately)", formatPdfMoney(report.summary.voidCents)],
    ["Net sales", formatPdfMoney(report.summary.netSalesCents)],
    ["Completed transactions", report.summary.transactionCount.toLocaleString("en-PH")],
    ["Average transaction", formatPdfMoney(report.summary.averageTransactionCents)],
    ["Net quantity sold", formatQuantity(report.summary.totalItemsSoldMicro)],
    ["Cash sales", formatPdfMoney(report.summary.cashSalesCents)]
  ];
  for (const [label, value] of summaryRows) keyValue(label, value);

  sectionTitle("Cash drawer reconciliation (not revenue)");
  const cashRows: Array<[string, string]> = [
    ["Drawer sessions", report.cashDrawer.sessionCount.toLocaleString("en-PH")],
    ["Opening cash", formatPdfMoney(report.cashDrawer.openingCashCents)],
    ["Cash sales after change", formatPdfMoney(report.cashDrawer.cashSalesCents)],
    ["Cash refunds", formatPdfMoney(report.cashDrawer.cashRefundsCents)],
    ["Cash in", formatPdfMoney(report.cashDrawer.cashInCents)],
    ["Cash out", formatPdfMoney(report.cashDrawer.cashOutCents)],
    ["Expected cash", formatPdfMoney(report.cashDrawer.expectedCashCents)],
    ["Actual cash counted", formatPdfMoney(report.cashDrawer.actualCashCents)],
    ["Total difference", formatPdfMoney(report.cashDrawer.differenceCents)],
    ["Sessions awaiting review", report.cashDrawer.reviewRequiredCount.toLocaleString("en-PH")]
  ];
  for (const [label, value] of cashRows) keyValue(label, value);

  sectionTitle("Payment breakdown");
  if (!report.payments.length) keyValue("No payment records", formatPdfMoney(0));
  for (const payment of report.payments) keyValue(payment.method.replaceAll("_", " "), formatPdfMoney(payment.amountCents));

  sectionTitle("Order type breakdown");
  if (!report.orderTypes.length) keyValue("No completed transactions", formatPdfMoney(0));
  for (const orderType of report.orderTypes) keyValue(`${orderType.orderType.replaceAll("_", " ")} (${orderType.transactionCount})`, formatPdfMoney(orderType.netSalesCents));

  sectionTitle("Best-selling products");
  if (!report.bestSellers.length) keyValue("No products sold", "0");
  for (const product of report.bestSellers.slice(0, 15)) {
    ensure(7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    const name = doc.splitTextToSize(`${product.name} (${product.sku})`, contentWidth * 0.62) as string[];
    doc.text(name, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatQuantity(product.quantityMicro)} ${product.soldUnit.toLowerCase()}`, pageWidth - margin, y, { align: "right" });
    y += Math.max(5, name.length * 4);
  }

  if (options.detailed) {
    sectionTitle("Transaction details");
    for (const transaction of report.transactions) {
      ensure(15);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.3);
      doc.text(transaction.receiptNumber, margin, y);
      doc.text(formatPdfMoney(transaction.netCents), pageWidth - margin, y, { align: "right" });
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(99, 112, 131);
      const context = [displayDate(transaction.createdAt, report.range.timezone, true), transaction.orderType.replaceAll("_", " "), transaction.tableNumber ? `Table ${transaction.tableNumber}` : null, transaction.paymentMethods.join(" + ") || "No payment", transaction.status.replaceAll("_", " ")].filter(Boolean).join(" | ");
      const lines = doc.splitTextToSize(context, contentWidth) as string[];
      doc.text(lines, margin, y);
      y += lines.length * 3.6;
      doc.text(`Gross ${formatPdfMoney(transaction.grossCents)}  Discount ${formatPdfMoney(transaction.discountCents)}  Tax ${formatPdfMoney(transaction.taxCents)}  Refund ${formatPdfMoney(transaction.refundCents)}`, margin, y);
      doc.setTextColor(23, 32, 42);
      y += 6;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(215, 222, 230);
    doc.line(margin, footerTop, pageWidth - margin, footerTop);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(99, 112, 131);
    doc.text("Generated by WholesalePOS Offline", margin, footerTop + 5);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, footerTop + 5, { align: "right" });
  }
  return { bytes: new Uint8Array(doc.output("arraybuffer")), pageCount };
}
