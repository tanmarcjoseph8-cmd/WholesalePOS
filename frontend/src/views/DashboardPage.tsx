import { useQuery } from "@tanstack/react-query";
import { fetchReportOverview, fetchStock } from "../lib/api";
import { formatCurrency } from "../lib/currency";

export function DashboardPage() {
  const report = useQuery({ queryKey: ["reports", "daily"], queryFn: () => fetchReportOverview({ period: "daily" }) });
  const stock = useQuery({ queryKey: ["stock", "dashboard"], queryFn: () => fetchStock("") });
  const lowStock = useQuery({ queryKey: ["stock", "low"], queryFn: () => fetchStock("", true) });
  const summary = report.data?.summary;
  const totalAvailableStock = stock.data?.items.reduce((sum, item) => sum + item.availableQuantity, 0) ?? 0;
  const metrics = [
    { label: "Today's Sales", value: formatCurrency(summary?.revenue ?? 0), tone: "bg-ocean" },
    { label: "Inventory Value", value: formatCurrency(summary?.inventoryValue ?? 0), tone: "bg-mint" },
    { label: "Available Stock", value: totalAvailableStock.toLocaleString(undefined, { maximumFractionDigits: 3 }), tone: "bg-amber" },
    { label: "Low Stock", value: (summary?.lowStockCount ?? 0).toLocaleString(), tone: "bg-rose" }
  ];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Operations Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Live sales, inventory value, available stock, and priority alerts from this device.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className={`mb-4 h-2 w-16 rounded-full ${metric.tone}`} />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{metric.label}</p>
            <p className="mt-2 text-2xl font-bold">{metric.value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-bold">Sales Activity</h3>
          <div className="mt-5 grid h-72 place-items-center rounded-md border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {report.isLoading ? "Loading sales activity..." : `${summary?.salesCount ?? 0} sale${summary?.salesCount === 1 ? "" : "s"} today.`}
          </div>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-bold">Priority Alerts</h3>
          <div className="mt-5 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            {lowStock.data?.items.length ? (
              lowStock.data.items.slice(0, 5).map((item) => (
                <p key={item.id} className="rounded-md bg-amber/10 p-3 font-semibold text-amber">
                  {item.product.name}: {item.availableQuantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.product.inventoryUnit.toLowerCase()} available.
                </p>
              ))
            ) : (
              <p className="rounded-md bg-slate-100 p-3 dark:bg-slate-800">No low-stock alerts.</p>
            )}
            <p className="rounded-md bg-slate-100 p-3 dark:bg-slate-800">No pending local updates.</p>
            <p className="rounded-md bg-slate-100 p-3 dark:bg-slate-800">
              {stock.data?.pagination.total ?? 0} stocked product{stock.data?.pagination.total === 1 ? "" : "s"} tracked.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
