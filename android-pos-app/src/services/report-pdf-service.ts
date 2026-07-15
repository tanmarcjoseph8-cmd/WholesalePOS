import type { AppSettings } from "../domain/models";
import { FileViewer } from "@capacitor/file-viewer";
import type { SalesReport } from "../domain/reporting";
import { fileService, type FileService } from "../platform/file-service";

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export class ReportPdfService {
  constructor(private files: FileService = fileService) {}

  async create(report: SalesReport, settings: AppSettings, detailed: boolean) {
    const { createSalesReportPdf } = await import("../domain/report-pdf");
    const pdf = createSalesReportPdf(report, settings, { detailed });
    const fileName = `sales-report-${report.range.fromDate}-to-${report.range.toDate}${detailed ? "-detailed" : "-summary"}.pdf`;
    const file = await this.files.writeCacheFile({ fileName, data: bytesToBase64(pdf.bytes), base64: true });
    return { ...file, fileName, pageCount: pdf.pageCount };
  }

  async share(fileName: string, uri: string) {
    await this.files.shareFile({ fileName, uri, dialogTitle: "Save, share, or print sales report" });
  }

  async preview(uri: string) {
    const path = decodeURIComponent(uri.replace(/^file:\/\//, ""));
    await FileViewer.openDocumentFromLocalPath({ path });
  }
}
