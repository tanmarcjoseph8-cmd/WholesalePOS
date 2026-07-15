import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, CheckCheck, ExternalLink, Search, Trash2 } from "lucide-react";
import { formatQuantity, type InventoryAlertRecord, type InventoryStatusRecord } from "../../domain/models";
import { useOfflineApp } from "../app-context";

export function AlertsView() {
  const { app, user, revision, refresh, notify, openInventoryProduct } = useOfflineApp();
  const [alerts, setAlerts] = useState<InventoryAlertRecord[]>([]);
  const [statuses, setStatuses] = useState<InventoryStatusRecord[]>([]);
  const [tab, setTab] = useState<"alerts" | "status">("alerts");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([app.inventoryAlerts.listAlerts(user), app.inventoryAlerts.listStockStatuses(user)]).then(([nextAlerts, nextStatuses]) => {
      if (active) { setAlerts(nextAlerts); setStatuses(nextStatuses); }
    }).catch((caught: unknown) => notify(caught instanceof Error ? caught.message : "Inventory alerts could not be loaded.", "error")).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [app, user, revision, notify]);

  const filteredAlerts = useMemo(() => alerts.filter((alert) => alert.productName.toLowerCase().includes(search.trim().toLowerCase())), [alerts, search]);
  const filteredStatuses = useMemo(() => statuses.filter((status) => status.productName.toLowerCase().includes(search.trim().toLowerCase())), [statuses, search]);
  const unread = alerts.filter((alert) => !alert.isRead).length;
  const lowCount = statuses.filter((status) => status.status === "LOW_STOCK").length;
  const outCount = statuses.filter((status) => status.status === "OUT_OF_STOCK").length;

  async function run(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true);
    try { await action(); refresh(); notify(success, "success"); }
    catch (caught) { notify(caught instanceof Error ? caught.message : "The alert could not be updated.", "error"); }
    finally { setBusy(false); }
  }

  async function openAlert(alert: InventoryAlertRecord) {
    if (!alert.isRead) await app.inventoryAlerts.markRead(user, alert.id);
    openInventoryProduct(alert.productId);
  }

  return (
    <section className="page-stack alerts-page">
      <header className="page-header"><div><h2>Inventory alerts</h2><p>Persistent low-stock activity from this tablet&apos;s live available inventory.</p></div><div className="header-actions"><button className="button secondary" disabled={busy || unread === 0} onClick={() => void run(() => app.inventoryAlerts.markAllRead(user), "All alerts marked read.")}><CheckCheck size={18} /> Mark all read</button><button className="button secondary" disabled={busy || !alerts.some((alert) => alert.isRead)} onClick={() => void run(() => app.inventoryAlerts.clearRead(user), "Read alerts cleared.")}><Trash2 size={18} /> Clear read</button></div></header>
      <div className="alert-summary"><article><Bell size={20} /><div><span>Unread</span><strong>{unread}</strong></div></article><article className="warning"><Bell size={20} /><div><span>Low stock</span><strong>{lowCount}</strong></div></article><article className="danger"><BellOff size={20} /><div><span>Out of stock</span><strong>{outCount}</strong></div></article></div>
      <div className="segmented"><button className={tab === "alerts" ? "active" : ""} onClick={() => setTab("alerts")}>Alert history</button><button className={tab === "status" ? "active" : ""} onClick={() => setTab("status")}>Current stock status</button></div>
      <label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product" /></label>
      {loading ? <p className="data-panel loading">Loading inventory alerts...</p> : null}
      {!loading && tab === "alerts" ? <section className="data-panel alert-list">{filteredAlerts.map((alert) => <article className={`${alert.isRead ? "read" : "unread"} ${alert.isResolved ? "resolved" : "active"}`} key={alert.id}><div className={`alert-icon ${alert.alertType === "OUT_OF_STOCK" ? "danger" : "warning"}`}>{alert.alertType === "OUT_OF_STOCK" ? <BellOff size={20} /> : <Bell size={20} />}</div><div className="alert-copy"><div><strong>{alert.alertType === "OUT_OF_STOCK" ? "Out of stock" : "Low stock"}: {alert.productName}</strong><span className={`status-label ${alert.alertType.toLowerCase()}`}>{alert.isResolved ? "Resolved" : alert.alertType.replaceAll("_", " ")}</span></div><p>{formatQuantity(alert.currentQuantityMicro)} {alert.inventoryUnit.toLowerCase()} available | threshold {formatQuantity(alert.thresholdMicro)} | {alert.warehouseName}</p><small>{new Date(alert.createdAt).toLocaleString("en-PH")}{alert.isRead ? " | Read" : " | Unread"}</small></div><button aria-label={`Open ${alert.productName} in inventory`} title="Open inventory item" onClick={() => void openAlert(alert)}><ExternalLink size={19} /></button></article>)}{!filteredAlerts.length ? <div className="empty-state"><Bell size={28} /><strong>No inventory alerts</strong><p>New low-stock and out-of-stock transitions will appear here.</p></div> : null}</section> : null}
      {!loading && tab === "status" ? <section className="data-panel stock-status-list"><div className="table-scroll"><table><thead><tr><th>Product</th><th>Location</th><th>Available</th><th>Threshold</th><th>Status</th><th /></tr></thead><tbody>{filteredStatuses.map((status) => <tr key={`${status.productId}-${status.warehouseId}`}><td><strong>{status.productName}</strong></td><td>{status.warehouseName}</td><td>{formatQuantity(status.currentQuantityMicro)} {status.inventoryUnit.toLowerCase()}</td><td>{formatQuantity(status.thresholdMicro)}</td><td><span className={`status-label ${status.status.toLowerCase()}`}>{status.status.replaceAll("_", " ")}</span></td><td><button className="table-icon-button" aria-label={`Open ${status.productName}`} onClick={() => openInventoryProduct(status.productId)}><ExternalLink size={18} /></button></td></tr>)}</tbody></table></div>{!filteredStatuses.length ? <p className="empty-state">No matching products.</p> : null}</section> : null}
    </section>
  );
}
