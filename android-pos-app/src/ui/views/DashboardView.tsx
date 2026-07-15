import { useEffect, useState } from "react";
import { Boxes, CircleDollarSign, ClipboardList, TriangleAlert, Utensils } from "lucide-react";
import { formatMoney, formatQuantity, type DashboardSnapshot } from "../../domain/models";
import { useOfflineApp } from "../app-context";

export function DashboardView() {
  const { app, revision } = useOfflineApp();
  const [data, setData] = useState<DashboardSnapshot | null>(null);

  useEffect(() => { void app.settingsReports.dashboard().then(setData); }, [app, revision]);
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
      <section className="notice-band"><strong>Offline ready</strong><span>Products, sales, tables, inventory, receipts, and backups do not require internet access.</span></section>
    </section>
  );
}

