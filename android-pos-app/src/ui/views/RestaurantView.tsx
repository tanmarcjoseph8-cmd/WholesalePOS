import { useEffect, useMemo, useRef, useState } from "react";
import { Armchair, ArrowRightLeft, Banknote, Check, Merge, Pencil, Plus, Power, Printer, RefreshCw, Scissors, Search, Trash2, Undo2, Users } from "lucide-react";
import { moneyInputToCents, paymentBalance, saleTotals, toBaseQuantity } from "../../domain/calculations";
import { createId, formatMoney, formatQuantity, orderTypes, QUANTITY_SCALE, type OrderLine, type OrderRecord, type OrderStatus, type OrderType, type ProductRecord, type RestaurantTableRecord } from "../../domain/models";
import type { SaleDetail } from "../../services/sales-service";
import { useOfflineApp } from "../app-context";
import { ConfirmDialog } from "../ConfirmDialog";
import { SaleReceiptDialog } from "../SaleReceiptDialog";

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = { OPEN: "CONFIRMED", CONFIRMED: "PREPARING", PREPARING: "READY", READY: "SERVED" };

export function RestaurantView() {
  const { app, user, revision, refresh, setUnsaved, notify, openCashDrawer } = useOfflineApp();
  const [view, setView] = useState<"tables" | "orders">("tables");
  const [tables, setTables] = useState<RestaurantTableRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [editing, setEditing] = useState<OrderRecord | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [newOrderType, setNewOrderType] = useState<OrderType>("WALK_IN");
  const [serviceChargeBasisPoints, setServiceChargeBasisPoints] = useState(0);
  const [cash, setCash] = useState(0);
  const [gcash, setGcash] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<SaleDetail | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [cashDrawerOpen, setCashDrawerOpen] = useState(false);
  const checkoutKey = useRef(createId("ordercheckout"));

  useEffect(() => {
    void Promise.all([app.restaurant.listTables(true), app.restaurant.listOrders(false), app.catalog.listProducts(productSearch), app.settingsReports.getSettings()]).then(([nextTables, nextOrders, nextProducts, nextSettings]) => {
      setTables(nextTables); setOrders(nextOrders); setProducts(nextProducts);
      setServiceChargeBasisPoints(nextSettings.serviceChargeBasisPoints);
      if (editing) {
        const fresh = nextOrders.find((order) => order.id === editing.id);
        if (fresh && fresh.version !== editing.version) { setEditing(fresh); setLines(fresh.lines); }
      }
    });
  }, [app, revision, productSearch, editing]);
  useEffect(() => { void app.cashDrawer.current(user).then((session) => setCashDrawerOpen(Boolean(session))).catch(() => setCashDrawerOpen(false)); }, [app, user, revision]);
  useEffect(() => { setUnsaved(Boolean(editing && JSON.stringify(lines) !== JSON.stringify(editing.lines))); return () => setUnsaved(false); }, [editing, lines, setUnsaved]);
  useEffect(() => {
    setLines((current) => {
      let changed = false;
      const repriced = current.map((line) => {
        const product = products.find((entry) => entry.id === line.productId);
        if (!product) return line;
        const expected = product.wholesaleThresholdMicro > 0 && line.baseQuantityMicro >= product.wholesaleThresholdMicro ? product.wholesalePriceCents : product.retailPriceCents;
        if (line.unitPriceCents === expected) return line;
        changed = true;
        return { ...line, unitPriceCents: expected };
      });
      return changed ? repriced : current;
    });
  }, [lines, products]);

  const totals = useMemo(() => {
    const base = saleTotals(lines);
    const serviceChargeCents = Math.round(((base.subtotalCents - base.discountCents) * serviceChargeBasisPoints) / 10_000);
    return { grandTotalCents: base.grandTotalCents + serviceChargeCents, serviceChargeCents };
  }, [lines, serviceChargeBasisPoints]);
  const total = totals.grandTotalCents;
  const payment = useMemo(() => paymentBalance(total, cash + gcash), [cash, gcash, total]);

  function openEditor(order: OrderRecord) { setEditing(order); setLines(order.lines); setView("orders"); setCash(0); setGcash(0); checkoutKey.current = createId("ordercheckout"); }

  async function createOrder(table?: RestaurantTableRecord, requestedType: OrderType = newOrderType) {
    setBusy(true);
    try {
      const order = await app.restaurant.createOrder(user, { requestKey: createId("orderrequest"), orderType: table ? "DINE_IN" : requestedType, guestCount: table ? Math.max(table.guestCount, 1) : 1, tableIds: table ? [table.id] : [], primaryTableId: table?.id ?? null });
      refresh(); openEditor(order);
    } catch (error) { notify(error instanceof Error ? error.message : "Order could not be opened.", "error"); }
    finally { setBusy(false); }
  }

  function addProduct(product: ProductRecord) {
    setLines((current) => {
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

  async function save(status?: OrderStatus) {
    if (!editing) return;
    setBusy(true);
    try {
      const next = await app.restaurant.updateOrder(user, { id: editing.id, expectedVersion: editing.version, status: status ?? editing.status, customerName: editing.customerName, guestCount: editing.guestCount, notes: editing.notes, lines, tableIds: editing.tableIds, primaryTableId: editing.primaryTableId });
      setEditing(next); setLines(next.lines); refresh(); notify("Order saved.", "success");
      return next;
    } catch (error) { notify(error instanceof Error ? error.message : "Order could not be saved.", "error"); return null; }
    finally { setBusy(false); }
  }

  async function checkout() {
    if (!editing || busy) return;
    setBusy(true);
    try {
      if (JSON.stringify(lines) !== JSON.stringify(editing.lines) && !(await save())) return;
      const fresh = await app.restaurant.getOrder(editing.id);
      const sale = await app.sales.completeSale({ requestKey: checkoutKey.current, orderId: fresh.id, orderType: fresh.orderType, customOrderType: fresh.customOrderType, cashierId: user.id, lines: [], serviceChargeCents: totals.serviceChargeCents, payments: [{ method: "CASH", amountCents: cash }, { method: "GCASH", amountCents: gcash }].filter((payment) => payment.amountCents > 0) as Array<{ method: "CASH" | "GCASH"; amountCents: number }> });
      const receipt = await app.sales.getSale(sale.id);
      setCompleted(receipt); setReceiptOpen(true); setEditing(null); setLines([]); setCash(0); setGcash(0); setCheckoutOpen(false); refresh(); notify(`Table paid. Receipt ${sale.receiptNumber}.`, "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Payment failed.", "error"); }
    finally { setBusy(false); }
  }

  async function addTable() {
    const number = window.prompt("Table number");
    if (!number) return;
    const section = window.prompt("Section", "Main") ?? "Main";
    const capacity = Number(window.prompt("Capacity", "4"));
    try { await app.restaurant.saveTable(user, { number, section, capacity }); refresh(); }
    catch (error) { notify(error instanceof Error ? error.message : "Table could not be created.", "error"); }
  }

  async function editTable(table: RestaurantTableRecord) {
    const number = window.prompt("Table number", table.number);
    if (!number) return;
    const section = window.prompt("Section", table.section) ?? table.section;
    const capacity = Number(window.prompt("Capacity", String(table.capacity)));
    try { await app.restaurant.saveTable(user, { id: table.id, number, section, capacity, status: table.status }); refresh(); }
    catch (error) { notify(error instanceof Error ? error.message : "Table could not be updated.", "error"); }
  }

  async function deactivateTable(table: RestaurantTableRecord) {
    const reason = window.prompt(`Reason for removing table ${table.number}`);
    if (!reason) return;
    try { await app.restaurant.setTableActive(user, table.id, false, reason); refresh(); notify("Table removed from the active floor plan.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Table could not be removed.", "error"); }
  }

  async function cancelOrder() {
    if (!editing) return;
    const reason = window.prompt("Cancellation reason");
    if (!reason) return;
    try { await app.restaurant.cancelOrder(user, editing.id, editing.version, reason); setEditing(null); setLines([]); refresh(); notify("Order cancelled and reservations released.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Order could not be cancelled.", "error"); }
  }

  async function transferOrder() {
    if (!editing) return;
    const available = tables.filter((table) => table.isActive && (!table.activeOrderId || table.activeOrderId === editing.id));
    const selected = window.prompt(`Move to table number (${available.map((table) => table.number).join(", ")})`);
    const table = available.find((candidate) => candidate.number.toLowerCase() === selected?.trim().toLowerCase());
    if (!table) return;
    const reason = window.prompt("Transfer reason");
    if (!reason) return;
    try { const next = await app.restaurant.transferOrder(user, editing.id, editing.version, [table.id], table.id, reason); setEditing(next); setLines(next.lines); refresh(); }
    catch (error) { notify(error instanceof Error ? error.message : "Order could not be transferred.", "error"); }
  }

  async function mergeOrder() {
    if (!editing) return;
    const candidates = orders.filter((order) => order.id !== editing.id);
    const selected = window.prompt(`Merge order number (${candidates.map((order) => order.orderNumber).join(", ")})`);
    const source = candidates.find((order) => order.orderNumber.toLowerCase() === selected?.trim().toLowerCase());
    if (!source) return;
    const reason = window.prompt("Merge reason");
    if (!reason) return;
    try { const next = await app.restaurant.mergeOrders(user, editing.id, editing.version, source.id, source.version, reason); setEditing(next); setLines(next.lines); refresh(); }
    catch (error) { notify(error instanceof Error ? error.message : "Orders could not be merged.", "error"); }
  }

  async function splitOrder() {
    if (!editing) return;
    const quantities = editing.lines.map((line) => ({ orderItemId: line.id ?? "", soldQuantityMicro: Math.round(Number(window.prompt(`Quantity of ${line.name} for new order`, "0")) * QUANTITY_SCALE) })).filter((entry) => entry.soldQuantityMicro > 0);
    if (!quantities.length) return;
    const reason = window.prompt("Split reason");
    if (!reason) return;
    try { const result = await app.restaurant.splitOrder(user, editing.id, editing.version, quantities, reason); setEditing(result.source); setLines(result.source.lines); refresh(); notify(`Created split order ${result.split.orderNumber}.`, "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Order could not be split.", "error"); }
  }

  const canManageTables = user.permissions.includes("*") || user.permissions.includes("tables.manage");

  return (
    <section className="page-stack">
      <header className="page-header"><div><h2>Restaurant</h2><p>Tables and unpaid orders use the same local products and inventory.</p></div><div className="header-actions order-create">{completed ? <button className="button secondary" onClick={() => setReceiptOpen(true)}><Printer size={18} /> Last receipt</button> : null}<select aria-label="New order type" value={newOrderType} onChange={(event) => setNewOrderType(event.target.value as OrderType)}>{orderTypes.filter((type) => type !== "DINE_IN").map((type) => <option value={type} key={type}>{type.replaceAll("_", " ")}</option>)}</select><button className="button secondary" onClick={() => void createOrder(undefined, newOrderType)} disabled={busy}><Plus size={18} /> New order</button>{canManageTables ? <button className="button primary" onClick={() => void addTable()}><Armchair size={18} /> Table</button> : null}</div></header>
      <div className="segmented"><button className={view === "tables" ? "active" : ""} onClick={() => setView("tables")}>Tables</button><button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}>Active orders</button></div>
      {view === "tables" ? <div className="table-sections">{[...new Set(tables.filter((table) => table.isActive).map((table) => table.section))].map((section) => <section key={section}><h3>{section}</h3><div className="restaurant-table-grid">{tables.filter((table) => table.isActive && table.section === section).map((table) => <article className={`restaurant-table status-${table.status.toLowerCase()}`} key={table.id}><div><strong>Table {table.number}</strong><span><Users size={15} /> {table.guestCount}/{table.capacity}</span></div>{canManageTables ? <div className="table-tools"><button aria-label={`Edit table ${table.number}`} onClick={() => void editTable(table)}><Pencil size={16} /></button><button aria-label={`Remove table ${table.number}`} disabled={Boolean(table.activeOrderId)} onClick={() => void deactivateTable(table)}><Power size={16} /></button></div> : null}<p>{table.status.toLowerCase()}</p>{table.activeOrderId ? <button className="button secondary" onClick={() => { const order = orders.find((entry) => entry.id === table.activeOrderId); if (order) openEditor(order); }}>Resume {table.activeOrderNumber}</button> : table.status === "AVAILABLE" ? <button className="button primary" onClick={() => void createOrder(table, "DINE_IN")}>Open table</button> : table.status === "CLEANING" && canManageTables ? <button className="button secondary" onClick={() => void app.restaurant.saveTable(user, { id: table.id, number: table.number, section: table.section, capacity: table.capacity, status: "AVAILABLE" }).then(refresh)}><Check size={16} /> Mark ready</button> : null}</article>)}</div></section>)}</div> : null}
      {view === "orders" ? <div className="restaurant-workspace"><aside className="order-list">{orders.map((order) => <button className={editing?.id === order.id ? "selected" : ""} onClick={() => openEditor(order)} key={order.id}><strong>{order.orderNumber}</strong><span>{order.customOrderType ?? order.orderType.replaceAll("_", " ")}</span><b>{order.status}</b></button>)}{!orders.length ? <p className="empty-state">No active orders.</p> : null}</aside>{editing ? <section className="order-editor"><header><div><span className="eyebrow">{editing.orderType.replaceAll("_", " ")}</span><h3>{editing.orderNumber}</h3></div><div className="header-actions"><button className="button secondary" onClick={() => void save()} disabled={busy}>Save</button>{nextStatus[editing.status] ? <button className="button primary" onClick={() => void save(nextStatus[editing.status])} disabled={busy}>{nextStatus[editing.status]}</button> : null}</div></header><div className="order-fields"><label>Customer<input value={editing.customerName ?? ""} onChange={(event) => setEditing({ ...editing, customerName: event.target.value || null })} /></label><label>Guests<input type="number" min="1" value={editing.guestCount} onChange={(event) => setEditing({ ...editing, guestCount: Number(event.target.value) })} /></label><label className="span-2">Notes<input value={editing.notes ?? ""} onChange={(event) => setEditing({ ...editing, notes: event.target.value || null })} /></label></div><div className="order-content"><section><h4>Order items</h4>{lines.map((line) => <article className="order-line" key={line.productId}><div><strong>{line.name}</strong><span>{formatMoney(line.unitPriceCents)}</span></div><input aria-label={`${line.name} quantity`} type="number" min="0.001" step="any" value={line.soldQuantityMicro / QUANTITY_SCALE} onChange={(event) => { const product = products.find((entry) => entry.id === line.productId); const sold = Math.max(1, Math.round(Number(event.target.value) * QUANTITY_SCALE)); setLines((current) => current.map((entry) => entry.productId === line.productId ? { ...entry, soldQuantityMicro: sold, baseQuantityMicro: toBaseQuantity(sold, product?.unitRatioMicro ?? QUANTITY_SCALE) } : entry)); }} /><input aria-label={`${line.name} discount`} type="number" min="0" step="0.01" value={line.discountCents / 100} onChange={(event) => setLines((current) => current.map((entry) => entry.productId === line.productId ? { ...entry, discountCents: Math.max(0, Math.round(Number(event.target.value) * 100)) } : entry))} /><button className="icon-danger" aria-label={`Remove ${line.name}`} onClick={() => setLines((current) => current.filter((entry) => entry.productId !== line.productId))}><Trash2 size={18} /></button></article>)}</section><aside><label className="search-box"><Search size={17} /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Find menu item" /></label>{products.map((product) => <button className="menu-product" key={product.id} disabled={product.availableMicro <= 0} onClick={() => addProduct(product)}><strong>{product.name}</strong><span>{formatMoney(product.retailPriceCents)}</span><small>{formatQuantity(product.availableMicro)} available</small></button>)}</aside></div><div className="order-total"><span>Total</span><strong>{formatMoney(total)}</strong></div><div className="order-actions"><button className="button secondary" onClick={() => void transferOrder()}><ArrowRightLeft size={17} /> Move</button><button className="button secondary" onClick={() => void mergeOrder()}><Merge size={17} /> Merge</button><button className="button secondary" onClick={() => void splitOrder()}><Scissors size={17} /> Split</button><button className="button secondary" onClick={() => { const reason = window.prompt("Undo reason"); if (reason) void app.restaurant.undoLastItemChange(user, editing.id, editing.version, reason).then((next) => { setEditing(next); setLines(next.lines); refresh(); }); }}><Undo2 size={17} /> Undo</button><button className="button danger" onClick={() => void cancelOrder()}>Cancel</button><button className="button primary" disabled={!lines.length} onClick={() => setCheckoutOpen(true)}>Pay</button></div></section> : <div className="empty-workspace"><RefreshCw size={32} /><strong>Select an order</strong></div>}</div> : null}
      <ConfirmDialog open={checkoutOpen} title={`Pay ${editing?.orderNumber ?? "order"}?`} confirmLabel={busy ? "Completing" : `Complete ${formatMoney(total)}`} disabled={busy || payment.dueCents > 0 || (cash > 0 && !cashDrawerOpen)} onClose={() => setCheckoutOpen(false)} onConfirm={() => void checkout()}><div className="payment-grid"><label>Cash<input type="number" min="0" step="0.01" value={cash / 100} onChange={(event) => setCash(moneyInputToCents(event.target.value))} /></label><label>GCash<input type="number" min="0" step="0.01" value={gcash / 100} onChange={(event) => setGcash(moneyInputToCents(event.target.value))} /></label></div>{cash > 0 && !cashDrawerOpen ? <div className="notice-band cash-drawer-notice"><span>Open the cash drawer before accepting cash.</span><button className="button secondary" onClick={openCashDrawer}><Banknote size={17} /> Open drawer</button></div> : null}<div className="payment-balance"><div><span>Amount received</span><strong>{formatMoney(payment.paidCents)}</strong></div><div className={payment.changeCents > 0 ? "change" : "due"}><span>{payment.changeCents > 0 ? "Change" : "Amount due"}</span><strong>{formatMoney(payment.changeCents > 0 ? payment.changeCents : payment.dueCents)}</strong></div></div><p>Payment will consume reservations and deduct physical stock once.</p></ConfirmDialog>
      <SaleReceiptDialog open={receiptOpen} sale={completed} onClose={() => setReceiptOpen(false)} />
    </section>
  );
}
