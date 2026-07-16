import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Printer, ReceiptText, RotateCcw, Search } from "lucide-react";
import { createId, formatMoney, formatQuantity, QUANTITY_SCALE, type SaleSummary } from "../../domain/models";
import type { SaleDetail } from "../../services/sales-service";
import { useOfflineApp } from "../app-context";
import { ConfirmDialog } from "../ConfirmDialog";

type ReversalMode = "REFUND" | "VOID";

export function SalesHistoryView() {
  const { app, user, revision, refresh, notify } = useOfflineApp();
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<ReversalMode | null>(null);
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const reversalKey = useRef(createId("reversal"));

  useEffect(() => { void app.sales.listSales(1000).then(setSales); }, [app, revision]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sales;
    return sales.filter((sale) => [sale.receiptNumber, sale.orderNumber, sale.orderType, sale.status].some((value) => value?.toLowerCase().includes(query)));
  }, [sales, search]);

  async function openSale(id: string) {
    try { setDetail(await app.sales.getSale(id)); }
    catch (error) { notify(error instanceof Error ? error.message : "Sale could not be loaded.", "error"); }
  }

  async function printReceipt() {
    if (!detail) return;
    try { await app.receiptPrinter.printOrShare(detail, await app.settingsReports.getSettings()); }
    catch (error) { notify(error instanceof Error ? error.message : "Receipt could not be shared.", "error"); }
  }

  function beginReversal(nextMode: ReversalMode) {
    if (!detail) return;
    setMode(nextMode);
    setReason("");
    setQuantities(Object.fromEntries(detail.lines.map((line) => [line.id, Math.max(0, line.soldQuantityMicro - line.refundedQuantityMicro)])));
    reversalKey.current = createId("reversal");
  }

  async function reverse() {
    if (!detail || !mode || busy) return;
    setBusy(true);
    try {
      const items = mode === "REFUND"
        ? detail.lines.map((line) => ({ saleItemId: line.id, soldQuantityMicro: quantities[line.id] ?? 0 })).filter((line) => line.soldQuantityMicro > 0)
        : undefined;
      await app.sales.reverseSale({ saleId: detail.id, requestKey: reversalKey.current, cashierId: user.id, reason, kind: mode, items });
      setMode(null);
      refresh();
      await openSale(detail.id);
      notify(mode === "VOID" ? "Sale voided and stock restored." : "Refund saved and stock restored.", "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Sale reversal failed.", "error"); }
    finally { setBusy(false); }
  }

  const canRefund = user.permissions.includes("*") || user.permissions.includes("sales.refund");
  const canVoid = user.permissions.includes("*") || user.permissions.includes("sales.void");

  return (
    <section className="page-stack">
      <header className="page-header"><div><h2>Sales history</h2><p>Receipts and reversals saved on this tablet.</p></div></header>
      <label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Receipt, order, type, or status" /></label>
      <div className="history-layout">
        <section className="sale-list data-panel">
          {filtered.map((sale) => <button className={detail?.id === sale.id ? "selected" : ""} key={sale.id} onClick={() => void openSale(sale.id)}><div><strong>{sale.receiptNumber}</strong><span>{new Date(sale.createdAt).toLocaleString("en-PH")}</span></div><div><b>{formatMoney(sale.grandTotalCents)}</b><small>{sale.status.replaceAll("_", " ")}</small></div></button>)}
          {!filtered.length ? <p className="empty-state">No matching sales.</p> : null}
        </section>
        <section className="receipt-detail data-panel">
          {detail ? <><header><div><span className="eyebrow">{detail.orderType.replaceAll("_", " ")}</span><h3>{detail.receiptNumber}</h3><p>{new Date(detail.createdAt).toLocaleString("en-PH")} | {detail.cashierName}</p></div><button className="button secondary" onClick={() => void printReceipt()}><Printer size={18} /> Receipt</button></header>
            <div className="receipt-lines">{detail.lines.map((line) => <article key={line.id}><div><strong>{line.name}</strong><span>{formatQuantity(line.soldQuantityMicro)} {line.soldUnit.toLowerCase()}</span>{line.refundedQuantityMicro > 0 ? <small>{formatQuantity(line.refundedQuantityMicro)} refunded</small> : null}</div><b>{formatMoney(line.lineTotalCents)}</b></article>)}</div>
            <div className="receipt-payments">{detail.payments.map((payment, index) => <span key={`${payment.method}-${index}`}>{payment.method}: <strong>{formatMoney(payment.amountCents)}</strong></span>)}</div>
            <div className="total-row"><span>Total</span><strong>{formatMoney(detail.grandTotalCents)}</strong></div>
            <div className="payment-balance receipt-history-balance"><div><span>Amount received</span><strong>{formatMoney(detail.paidTotalCents)}</strong></div><div className="change"><span>Change</span><strong>{formatMoney(detail.changeTotalCents)}</strong></div></div>
            <div className="history-actions">{canRefund ? <button className="button secondary" disabled={!['COMPLETED', 'PARTIALLY_REFUNDED'].includes(detail.status)} onClick={() => beginReversal("REFUND")}><RotateCcw size={17} /> Refund</button> : null}{canVoid ? <button className="button danger" disabled={!['COMPLETED', 'PARTIALLY_REFUNDED'].includes(detail.status)} onClick={() => beginReversal("VOID")}><Ban size={17} /> Void sale</button> : null}</div>
          </> : <div className="empty-workspace"><ReceiptText size={34} /><strong>Select a receipt</strong></div>}
        </section>
      </div>
      <ConfirmDialog open={mode !== null} title={mode === "VOID" ? "Void this entire sale?" : "Refund selected quantities?"} confirmLabel={busy ? "Saving" : mode === "VOID" ? "Void sale" : "Save refund"} destructive disabled={busy || reason.trim().length < 3 || (mode === "REFUND" && !Object.values(quantities).some((quantity) => quantity > 0))} onClose={() => setMode(null)} onConfirm={() => void reverse()}>
        {mode === "REFUND" ? <div className="refund-lines">{detail?.lines.map((line) => { const remaining = line.soldQuantityMicro - line.refundedQuantityMicro; return <label key={line.id}>{line.name}<input type="number" min="0" max={remaining / QUANTITY_SCALE} step="any" value={(quantities[line.id] ?? 0) / QUANTITY_SCALE} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: Math.min(remaining, Math.max(0, Math.round(Number(event.target.value) * QUANTITY_SCALE))) }))} /><small>{formatQuantity(remaining)} remaining</small></label>; })}</div> : <p>All remaining quantities will return to inventory. This action remains in the audit log.</p>}
        <label>Required reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} required /></label>
      </ConfirmDialog>
    </section>
  );
}
