import { Printer, ReceiptText, X } from "lucide-react";
import { useState } from "react";
import { formatMoney, formatQuantity } from "../domain/models";
import type { SaleDetail } from "../services/sales-service";
import { useOfflineApp } from "./app-context";

export function SaleReceiptDialog(props: { open: boolean; sale: SaleDetail | null; onClose: () => void }) {
  const { app, notify } = useOfflineApp();
  const [printing, setPrinting] = useState(false);
  if (!props.open || !props.sale) return null;
  const sale = props.sale;

  async function printReceipt() {
    setPrinting(true);
    try {
      await app.receiptPrinter.printOrShare(sale, await app.settingsReports.getSettings());
    } catch (error) {
      notify(error instanceof Error ? error.message : "Receipt could not be printed.", "error");
    } finally {
      setPrinting(false);
    }
  }

  const totals = [
    ["Subtotal", sale.subtotalCents],
    ["Discount", -sale.discountCents],
    ["Tax", sale.taxCents],
    ["Service charge", sale.serviceChargeCents],
    ["Tip", sale.tipCents]
  ] as const;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section className="dialog sale-receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="sale-receipt-title">
        <div className="dialog-title">
          <div className="receipt-dialog-heading"><ReceiptText size={24} /><div><span className="eyebrow">Payment complete</span><h2 id="sale-receipt-title">{sale.businessName}</h2><p>{sale.receiptNumber}</p></div></div>
          <button type="button" aria-label="Close receipt" onClick={props.onClose}><X size={20} /></button>
        </div>
        <div className="receipt-preview-meta"><span>{new Date(sale.createdAt).toLocaleString("en-PH")}</span><span>Cashier: {sale.cashierName}</span>{sale.orderNumber ? <span>Order: {sale.orderNumber}</span> : null}</div>
        <div className="receipt-lines receipt-dialog-lines">{sale.lines.map((line) => <article key={line.id}><div><strong>{line.name}</strong><span>{formatQuantity(line.soldQuantityMicro)} {line.soldUnit.toLowerCase()} x {formatMoney(line.unitPriceCents)}</span></div><b>{formatMoney(line.lineTotalCents)}</b></article>)}</div>
        <div className="receipt-total-list">
          {totals.filter(([, amount]) => amount !== 0).map(([label, amount]) => <div key={label}><span>{label}</span><strong>{formatMoney(amount)}</strong></div>)}
          <div className="receipt-grand-total"><span>Total</span><strong>{formatMoney(sale.grandTotalCents)}</strong></div>
        </div>
        <div className="receipt-payment-list">
          {sale.payments.map((payment, index) => <div key={`${payment.method}-${index}`}><span>{payment.method.replaceAll("_", " ")}</span><strong>{formatMoney(payment.amountCents)}</strong></div>)}
          <div><span>Amount received</span><strong>{formatMoney(sale.paidTotalCents)}</strong></div>
          <div className="receipt-change"><span>Change</span><strong>{formatMoney(sale.changeTotalCents)}</strong></div>
        </div>
        <div className="dialog-actions"><button className="button ghost" onClick={props.onClose}>Close</button><button className="button primary" disabled={printing} onClick={() => void printReceipt()}><Printer size={18} /> {printing ? "Opening print" : "Print receipt"}</button></div>
      </section>
    </div>
  );
}
