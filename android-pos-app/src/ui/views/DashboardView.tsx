import { useEffect, useState } from "react";
import { Boxes, CircleDollarSign, ClipboardList, ExternalLink, TriangleAlert, Utensils } from "lucide-react";
import { formatMoney, formatQuantity, type DashboardSnapshot, type InventoryStatusRecord } from "../../domain/models";
import { useOfflineApp } from "../app-context";

export function DashboardView() {
  const { app, user, revision, openInventoryProduct } = useOfflineApp();
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [stockAlerts, setStockAlerts] = useState<InventoryStatusRecord[]>([]);

  useEffect(() => {
    void Promise.all([app.settingsReports.dashboard(), app.inventoryAlerts.listStockStatuses(user)]).then(([snapshot, statuses]) => {
      setData(snapshot);
      setStockAlerts(statuses.filter((status) => status.status !== "NORMAL").sort((left, right) => {
        if (left.status !== right.status) return left.status === "OUT_OF_STOCK" ? -1 : 1;
        return left.currentQuantityMicro - right.currentQuantityMicro || left.productName.localeCompare(right.productName);
      }));
    });
  }, [app, user, revision]);
  if (!data) return <p className="loading">Loading local dashboard...</p>;

  const cards = [
    { label: "Today's sales", value: formatMoney(data.todaySalesCents), detail: `${data.todaySalesCount} completed`, icon: CircleDollarSign },
    { label: "Available stock", value: formatQuantity(data.availableStockMicro), detail: "base units", icon: Boxes },
    { label: "Low stock", value: String(data.lowStockCount), detail: "products to reorder", icon: TriangleAlert },
    { label: "Open orders", value: String(data.openOrderCount), detail: "saved on tablet", icon: ClipboardList },
    { label: "Occupied tables", value: String(data.occupiedTableCount), detail: "currently active", icon: Utensils }
  ];

  return (
    <section className="page-stack">
      <header className="page-header"><div><h2>Operations</h2><p>Live totals from this tablet&apos;s local database.</p></div></header>
      <div className="metric-grid">
        {cards.map(({ label, value, detail, icon: Icon }) => <article className="metric" key={label}><Icon size={21} /><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}
      </div>
      <section className="data-panel dashboard-stock-alerts">
        <header><div><h3>Products needing stock</h3><p>Live available quantity compared with each product&apos;s threshold.</p></div><strong>{stockAlerts.length}</strong></header>
        {stockAlerts.length ? <div>{stockAlerts.map((status) => <button key={`${status.productId}-${status.warehouseId}`} onClick={() => openInventoryProduct(status.productId)}><div><strong>{status.productName}</strong><span>{status.warehouseName}</span></div><div className="dashboard-stock-quantity"><b>{formatQuantity(status.currentQuantityMicro)} {status.inventoryUnit.toLowerCase()} left</b><span>Threshold {formatQuantity(status.thresholdMicro)}</span></div><span className={`status-label ${status.status.toLowerCase()}`}>{status.status.replaceAll("_", " ")}</span><ExternalLink size={18} /></button>)}</div> : <p className="empty-state">All products are above their low-stock thresholds.</p>}
      </section>
      <section className="notice-band"><strong>Offline ready</strong><span>Products, sales, tables, inventory, receipts, and backups do not require internet access.</span></section>
    </section>
  );
}
