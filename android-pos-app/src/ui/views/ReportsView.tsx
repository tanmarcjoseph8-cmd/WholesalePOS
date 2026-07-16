import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, RefreshCw, Share2, X } from "lucide-react";
import { formatMoney, formatQuantity, type AppSettings } from "../../domain/models";
import { reportPresetLabel, type ReportPreset, type SalesReport } from "../../domain/reporting";
import { useOfflineApp } from "../app-context";

const presets: ReportPreset[] = ["TODAY", "THIS_WEEK", "THIS_MONTH", "PREVIOUS_DAY", "PREVIOUS_WEEK", "PREVIOUS_MONTH", "CUSTOM"];
const today = () => new Date().toISOString().slice(0, 10);

type PdfPreview = { uri: string; webPath: string; fileName: string; pageCount: number };

export function ReportsView() {
  const { app, user, revision, refresh, notify } = useOfflineApp();
  const [preset, setPreset] = useState<ReportPreset>("TODAY");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [report, setReport] = useState<SalesReport | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailedPdf, setDetailedPdf] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [preview, setPreview] = useState<PdfPreview | null>(null);

  useEffect(() => {
    if (preset === "CUSTOM" && (!fromDate || !toDate || fromDate > toDate)) return;
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all([
      app.mobileReports.getSalesReport(user, preset, preset === "CUSTOM" ? { fromDate, toDate } : null),
      app.settingsReports.getSettings()
    ]).then(([nextReport, nextSettings]) => {
      if (active) { setReport(nextReport); setSettings(nextSettings); }
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "The local sales report could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [app, user, preset, fromDate, toDate, revision]);

  const transactionLabel = useMemo(() => `${report?.summary.transactionCount ?? 0} completed transaction${report?.summary.transactionCount === 1 ? "" : "s"}`, [report]);

  async function generatePdf() {
    if (!report || !settings || pdfBusy) return;
    setPdfBusy(true);
    try {
      const file = await app.reportPdf.create(report, settings, detailedPdf);
      setPreview(file);
      notify(`PDF created with ${file.pageCount} page${file.pageCount === 1 ? "" : "s"}.`, "success");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "The PDF report could not be created.", "error");
    } finally {
      setPdfBusy(false);
    }
  }

  async function sharePdf() {
    if (!preview) return;
    try { await app.reportPdf.share(preview.fileName, preview.uri); }
    catch (caught) { notify(caught instanceof Error ? caught.message : "The report could not be shared.", "error"); }
  }

  async function openPdfViewer() {
    if (!preview) return;
    try { await app.reportPdf.preview(preview.uri); }
    catch { notify("No PDF viewer is installed. Use Save, share, or print to open the report in another app.", "error"); }
  }

  return (
    <section className="page-stack reports-page">
      <header className="page-header"><div><h2>Sales reports</h2><p>Completed sales and reversals stored on this tablet.</p></div><div className="header-actions"><label className="toggle-row compact-toggle"><input type="checkbox" checked={detailedPdf} onChange={(event) => setDetailedPdf(event.target.checked)} /> Include transactions</label><button className="button primary" disabled={!report || pdfBusy} onClick={() => void generatePdf()}><FileText size={18} /> {pdfBusy ? "Creating PDF" : "Export PDF"}</button></div></header>

      <div className="report-filter data-panel">
        <div className="report-preset-grid">{presets.map((option) => <button className={preset === option ? "active" : ""} key={option} onClick={() => setPreset(option)}>{reportPresetLabel(option)}</button>)}</div>
        {preset === "CUSTOM" ? <div className="date-range"><label>From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>To<input type="date" min={fromDate} value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div> : null}
        {report ? <p className="local-data-note">{report.range.fromDate} to {report.range.toDate} | {report.range.timezone} | Local tablet data only</p> : null}
      </div>

      {loading ? <div className="data-panel loading-state"><RefreshCw className="spin" size={25} /><strong>Calculating local report</strong></div> : null}
      {error ? <div className="data-panel error-state"><strong>Report unavailable</strong><p>{error}</p><button className="button secondary" onClick={refresh}>Retry</button></div> : null}
      {!loading && !error && report ? <>
        <div className="report-metrics">
          <article><span>Net sales</span><strong>{formatMoney(report.summary.netSalesCents)}</strong><small>{transactionLabel}</small></article>
          <article><span>Gross sales</span><strong>{formatMoney(report.summary.grossSalesCents)}</strong><small>Before discounts and reversals</small></article>
          <article><span>Discounts</span><strong>{formatMoney(report.summary.discountCents)}</strong><small>Applied at checkout</small></article>
          <article><span>Tax</span><strong>{formatMoney(report.summary.taxCents)}</strong><small>Recorded tax total</small></article>
          <article><span>Refunds</span><strong>{formatMoney(report.summary.refundCents)}</strong><small>Voids: {formatMoney(report.summary.voidCents)}</small></article>
          <article><span>Average sale</span><strong>{formatMoney(report.summary.averageTransactionCents)}</strong><small>{formatQuantity(report.summary.totalItemsSoldMicro)} net quantity sold</small></article>
        </div>

        <div className="report-breakdowns">
          <section className="data-panel report-list"><header><h3>Payments</h3><span>Net of refunds</span></header>{report.payments.map((payment) => <div key={payment.method}><span>{payment.method.replaceAll("_", " ")}</span><strong>{formatMoney(payment.amountCents)}</strong></div>)}{!report.payments.length ? <p className="empty-state">No completed payments.</p> : null}</section>
          <section className="data-panel report-list"><header><h3>Order types</h3><span>Transactions and net sales</span></header>{report.orderTypes.map((entry) => <div key={entry.orderType}><span>{entry.orderType.replaceAll("_", " ")} <small>{entry.transactionCount}</small></span><strong>{formatMoney(entry.netSalesCents)}</strong></div>)}{!report.orderTypes.length ? <p className="empty-state">No completed orders.</p> : null}</section>
        </div>

        <section className="data-panel report-transactions cash-report-panel"><header><div><h3>Cash drawer reconciliation</h3><span>Physical cash control, separate from sales revenue</span></div><b>{report.cashDrawer.reviewRequiredCount ? `${report.cashDrawer.reviewRequiredCount} need review` : "Reconciled"}</b></header><div className="report-metrics drawer-report-metrics"><article><span>Opening cash</span><strong>{formatMoney(report.cashDrawer.openingCashCents)}</strong></article><article><span>Cash sales</span><strong>{formatMoney(report.cashDrawer.cashSalesCents)}</strong></article><article><span>Cash in / out</span><strong>{formatMoney(report.cashDrawer.cashInCents - report.cashDrawer.cashOutCents)}</strong></article><article><span>Expected cash</span><strong>{formatMoney(report.cashDrawer.expectedCashCents)}</strong></article><article><span>Actual counted</span><strong>{formatMoney(report.cashDrawer.actualCashCents)}</strong></article><article><span>Difference</span><strong className={report.cashDrawer.differenceCents === 0 ? "success" : "low"}>{formatMoney(report.cashDrawer.differenceCents)}</strong></article></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Cashier</th><th>Status</th><th>Opening</th><th>Expected</th><th>Actual</th><th>Difference</th></tr></thead><tbody>{report.cashDrawer.sessions.map((session) => <tr key={session.id}><td>{session.businessDate}</td><td>{session.cashierName}</td><td>{session.status.replaceAll("_", " ")}</td><td>{formatMoney(session.openingCashCents)}</td><td>{formatMoney(session.expectedCashCents)}</td><td>{session.actualCashCents === null ? "-" : formatMoney(session.actualCashCents)}</td><td className={session.differenceCents === 0 ? "success" : "low"}>{session.differenceCents === null ? "-" : formatMoney(session.differenceCents)}</td></tr>)}</tbody></table></div>{!report.cashDrawer.sessions.length ? <p className="empty-state">No cash drawer sessions in this period.</p> : null}</section>

        <div className="report-breakdowns">
          <section className="data-panel report-products"><header><h3>Best-selling products</h3><span>By net quantity</span></header>{report.bestSellers.slice(0, 10).map((product) => <article key={product.productId}><div><strong>{product.name}</strong><span>{product.sku}</span></div><div><b>{formatQuantity(product.quantityMicro)} {product.soldUnit.toLowerCase()}</b><span>{formatMoney(product.salesCents)}</span></div></article>)}{!report.bestSellers.length ? <p className="empty-state">No products sold in this period.</p> : null}</section>
          <section className="data-panel report-products"><header><h3>Highest sales value</h3><span>By net line value</span></header>{report.highestSalesValue.slice(0, 10).map((product) => <article key={product.productId}><div><strong>{product.name}</strong><span>{formatQuantity(product.quantityMicro)} {product.soldUnit.toLowerCase()}</span></div><b>{formatMoney(product.salesCents)}</b></article>)}{!report.highestSalesValue.length ? <p className="empty-state">No product revenue in this period.</p> : null}</section>
        </div>

        <section className="data-panel report-transactions"><header><h3>Transactions</h3><span>{report.transactions.length} finalized records including separately labeled voids</span></header><div className="table-scroll"><table><thead><tr><th>Receipt</th><th>Date</th><th>Order</th><th>Payment</th><th>Gross</th><th>Discount</th><th>Tax</th><th>Net</th><th>Status</th></tr></thead><tbody>{report.transactions.map((transaction) => <tr key={transaction.id}><td><strong>{transaction.receiptNumber}</strong></td><td>{new Date(transaction.createdAt).toLocaleString("en-PH", { timeZone: report.range.timezone })}</td><td>{transaction.orderType.replaceAll("_", " ")}{transaction.tableNumber ? ` | Table ${transaction.tableNumber}` : ""}</td><td>{transaction.paymentMethods.join(" + ") || "-"}</td><td>{formatMoney(transaction.grossCents)}</td><td>{formatMoney(transaction.discountCents)}</td><td>{formatMoney(transaction.taxCents)}</td><td>{formatMoney(transaction.netCents)}</td><td>{transaction.status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div>{!report.transactions.length ? <p className="empty-state">No finalized sales in this period.</p> : null}</section>
      </> : null}

      {preview ? <div className="dialog-backdrop"><section className="dialog pdf-preview-dialog"><div className="dialog-title"><div><h2>Sales report preview</h2><p>{preview.pageCount} page{preview.pageCount === 1 ? "" : "s"} | A4 PDF</p></div><button aria-label="Close PDF preview" onClick={() => setPreview(null)}><X size={20} /></button></div><iframe title="Sales report PDF preview" src={preview.webPath} /><div className="dialog-actions"><button className="button ghost" onClick={() => setPreview(null)}>Close</button><button className="button secondary" onClick={() => void openPdfViewer()}><ExternalLink size={18} /> Open viewer</button><button className="button primary" onClick={() => void sharePdf()}><Share2 size={18} /> Save, share, or print</button></div></section></div> : null}
    </section>
  );
}
