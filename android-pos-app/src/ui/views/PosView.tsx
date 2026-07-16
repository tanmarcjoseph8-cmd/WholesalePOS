import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Printer, Search, ShoppingCart, Trash2 } from "lucide-react";
import { moneyInputToCents, paymentBalance, toBaseQuantity } from "../../domain/calculations";
import { createId, formatMoney, formatQuantity, QUANTITY_SCALE, type CartLine, type ProductRecord } from "../../domain/models";
import type { SaleDetail } from "../../services/sales-service";
import { useOfflineApp } from "../app-context";
import { ConfirmDialog } from "../ConfirmDialog";
import { SaleReceiptDialog } from "../SaleReceiptDialog";

export function PosView() {
  const { app, user, revision, refresh, setUnsaved, notify } = useOfflineApp();
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cash, setCash] = useState(0);
  const [gcash, setGcash] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<SaleDetail | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const requestKey = useRef(createId("checkout"));

  useEffect(() => { void app.catalog.listProducts(search).then(setProducts); }, [app, search, revision]);
  useEffect(() => { setUnsaved(cart.length > 0); return () => setUnsaved(false); }, [cart.length, setUnsaved]);

  const total = useMemo(() => cart.reduce((sum, line) => {
    const gross = Math.round((line.unitPriceCents * line.soldQuantityMicro) / QUANTITY_SCALE);
    const taxable = gross - line.discountCents;
    return sum + taxable + Math.round((taxable * line.taxBasisPoints) / 10_000);
  }, 0), [cart]);
  const payment = useMemo(() => paymentBalance(total, cash + gcash), [cash, gcash, total]);

  function addProduct(product: ProductRecord) {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) return current.map((line) => {
        if (line.productId !== product.id) return line;
        const soldQuantityMicro = line.soldQuantityMicro + QUANTITY_SCALE;
        const baseQuantityMicro = toBaseQuantity(soldQuantityMicro, product.unitRatioMicro);
        const unitPriceCents = product.wholesaleThresholdMicro > 0 && baseQuantityMicro >= product.wholesaleThresholdMicro ? product.wholesalePriceCents : product.retailPriceCents;
        return { ...line, soldQuantityMicro, baseQuantityMicro, unitPriceCents };
      });
      const baseQuantityMicro = toBaseQuantity(QUANTITY_SCALE, product.unitRatioMicro);
      const unitPriceCents = product.wholesaleThresholdMicro > 0 && baseQuantityMicro >= product.wholesaleThresholdMicro ? product.wholesalePriceCents : product.retailPriceCents;
      return [...current, { productId: product.id, name: product.name, soldQuantityMicro: QUANTITY_SCALE, soldUnit: product.sellingUnit, baseQuantityMicro, unitPriceCents, discountCents: 0, taxBasisPoints: product.taxBasisPoints }];
    });
  }

  function setQuantity(productId: string, value: number) {
    const product = products.find((entry) => entry.id === productId);
    if (!product) return;
    const soldQuantityMicro = Math.max(1, Math.round(value * QUANTITY_SCALE));
    const baseQuantityMicro = toBaseQuantity(soldQuantityMicro, product.unitRatioMicro);
    const unitPriceCents = product.wholesaleThresholdMicro > 0 && baseQuantityMicro >= product.wholesaleThresholdMicro ? product.wholesalePriceCents : product.retailPriceCents;
    setCart((current) => current.map((line) => line.productId === productId ? { ...line, soldQuantityMicro, baseQuantityMicro, unitPriceCents } : line));
  }

  function setDiscount(productId: string, value: number) {
    setCart((current) => current.map((line) => line.productId === productId ? { ...line, discountCents: Math.max(0, Math.round(value * 100)) } : line));
  }

  async function checkout() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const sale = await app.sales.completeSale({ requestKey: requestKey.current, orderType: "RETAIL", cashierId: user.id, lines: cart, payments: [{ method: "CASH", amountCents: cash }, { method: "GCASH", amountCents: gcash }].filter((entry) => entry.amountCents > 0) as Array<{ method: "CASH" | "GCASH"; amountCents: number }> });
      const receipt = await app.sales.getSale(sale.id);
      setCompleted(receipt);
      setReceiptOpen(true);
      setCart([]);
      setCash(0);
      setGcash(0);
      setConfirming(false);
      requestKey.current = createId("checkout");
      refresh();
      notify(`Sale ${sale.receiptNumber} completed.`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Checkout failed.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-stack pos-layout">
      <div className="catalog-pane">
        <header className="page-header"><div><h2>Point of Sale</h2><p>Search, scan, and sell from local stock.</p></div></header>
        <label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product name, SKU, or barcode" autoFocus /></label>
        <div className="product-grid">
          {products.map((product) => <button className="product-tile" key={product.id} disabled={product.availableMicro <= 0} onClick={() => addProduct(product)}><strong>{product.name}</strong><span>{product.sku}</span><b>{formatMoney(product.retailPriceCents)}</b><small className={product.availableMicro <= product.minimumStockMicro ? "low" : ""}>{formatQuantity(product.availableMicro)} {product.inventoryUnit.toLowerCase()} available</small></button>)}
          {!products.length ? <p className="empty-state">No matching products.</p> : null}
        </div>
      </div>
      <aside className="cart-pane">
        <h3><ShoppingCart size={20} /> Current cart</h3>
        <div className="cart-lines">
          {cart.map((line) => <article className="cart-line" key={line.productId}><div><strong>{line.name}</strong><span>{formatMoney(line.unitPriceCents)} / {line.soldUnit.toLowerCase()}</span></div><div className="quantity-control"><button aria-label={`Decrease ${line.name}`} onClick={() => setQuantity(line.productId, Math.max(0.001, line.soldQuantityMicro / QUANTITY_SCALE - 1))}><Minus size={17} /></button><input aria-label={`${line.name} quantity`} type="number" min="0.001" step="any" value={line.soldQuantityMicro / QUANTITY_SCALE} onChange={(event) => setQuantity(line.productId, Number(event.target.value))} /><button aria-label={`Increase ${line.name}`} onClick={() => setQuantity(line.productId, line.soldQuantityMicro / QUANTITY_SCALE + 1)}><Plus size={17} /></button><button className="icon-danger" aria-label={`Remove ${line.name}`} onClick={() => setCart((current) => current.filter((entry) => entry.productId !== line.productId))}><Trash2 size={17} /></button></div><label className="line-discount">Discount<input type="number" min="0" step="0.01" value={line.discountCents / 100} onChange={(event) => setDiscount(line.productId, Number(event.target.value))} /></label></article>)}
          {!cart.length ? <p className="empty-state">No items selected.</p> : null}
        </div>
        <div className="total-row"><span>Total</span><strong>{formatMoney(total)}</strong></div>
        <div className="payment-grid"><label>Cash<input type="number" min="0" step="0.01" value={cash / 100} onChange={(event) => setCash(moneyInputToCents(event.target.value))} /></label><label>GCash<input type="number" min="0" step="0.01" value={gcash / 100} onChange={(event) => setGcash(moneyInputToCents(event.target.value))} /></label></div>
        <div className="payment-balance"><div><span>Amount received</span><strong>{formatMoney(payment.paidCents)}</strong></div><div className={payment.changeCents > 0 ? "change" : "due"}><span>{payment.changeCents > 0 ? "Change" : "Amount due"}</span><strong>{formatMoney(payment.changeCents > 0 ? payment.changeCents : payment.dueCents)}</strong></div></div>
        <button className="button primary wide" disabled={!cart.length || payment.dueCents > 0} onClick={() => setConfirming(true)}>Charge {formatMoney(total)}</button>
        {completed ? <button className="button secondary wide" onClick={() => setReceiptOpen(true)}><Printer size={18} /> View receipt {completed.receiptNumber}</button> : null}
      </aside>
      <ConfirmDialog open={confirming} title="Complete this sale?" confirmLabel={submitting ? "Completing" : `Charge ${formatMoney(total)}`} disabled={submitting} onClose={() => setConfirming(false)} onConfirm={() => void checkout()}><div className="payment-confirm-summary"><span>Total <strong>{formatMoney(total)}</strong></span><span>Received <strong>{formatMoney(payment.paidCents)}</strong></span><span>Change <strong>{formatMoney(payment.changeCents)}</strong></span></div><p>The sale, payments, stock deduction, inventory movements, and receipt will be saved together. Repeated taps cannot create a duplicate sale.</p></ConfirmDialog>
      <SaleReceiptDialog open={receiptOpen} sale={completed} onClose={() => setReceiptOpen(false)} />
    </section>
  );
}
