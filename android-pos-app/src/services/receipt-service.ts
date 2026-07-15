import { formatMoney, formatQuantity, type AppSettings } from "../domain/models";
import { fileService, type FileService } from "../platform/file-service";
import type { SaleDetail } from "./sales-service";

export interface ReceiptPrinter {
  printOrShare(sale: SaleDetail, settings: AppSettings): Promise<string>;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export class AndroidPdfReceiptPrinter implements ReceiptPrinter {
  constructor(private files: FileService = fileService) {}

  async printOrShare(sale: SaleDetail, settings: AppSettings) {
    const { jsPDF } = await import("jspdf");
    const width = settings.paperWidth === "58mm" ? 58 : 80;
    const estimatedHeight = Math.max(140, 105 + sale.lines.length * 12 + sale.payments.length * 7);
    const doc = new jsPDF({ unit: "mm", format: [width, estimatedHeight], orientation: "portrait" });
    const margin = 4;
    let y = 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(settings.businessName || sale.businessName, width / 2, y, { align: "center" });
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Receipt ${sale.receiptNumber}`, margin, y);
    y += 4;
    doc.text(new Date(sale.createdAt).toLocaleString("en-PH"), margin, y);
    y += 4;
    doc.text(`Cashier: ${sale.cashierName}`, margin, y);
    y += 5;
    doc.line(margin, y, width - margin, y);
    y += 5;
    for (const line of sale.lines) {
      doc.setFont("helvetica", "bold");
      doc.text(line.name.slice(0, settings.paperWidth === "58mm" ? 30 : 44), margin, y);
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.text(`${formatQuantity(line.soldQuantityMicro)} ${line.soldUnit.toLowerCase()} x ${formatMoney(line.unitPriceCents)}`, margin, y);
      doc.text(formatMoney(line.lineTotalCents), width - margin, y, { align: "right" });
      y += 5;
    }
    doc.line(margin, y, width - margin, y);
    y += 5;
    const totals: Array<[string, number]> = [["Subtotal", sale.subtotalCents], ["Discount", -sale.discountCents], ["Tax", sale.taxCents], ["Service", sale.serviceChargeCents], ["Tip", sale.tipCents]];
    for (const [label, amount] of totals.filter(([, amount]) => amount !== 0)) {
      doc.text(label, margin, y);
      doc.text(formatMoney(amount), width - margin, y, { align: "right" });
      y += 4;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL", margin, y);
    doc.text(formatMoney(sale.grandTotalCents), width - margin, y, { align: "right" });
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(settings.receiptFooter, width / 2, y, { align: "center" });
    const base64 = arrayBufferToBase64(doc.output("arraybuffer"));
    return this.files.saveAndShare({ fileName: `${sale.receiptNumber}.pdf`, data: base64, base64: true, mimeType: "application/pdf", dialogTitle: "Print or save receipt" });
  }
}
