import { formatCurrency } from "../lib/currency";

const metrics = [
  { label: "Today's Sales", value: formatCurrency(0), tone: "bg-ocean" },
  { label: "Inventory Value", value: formatCurrency(0), tone: "bg-mint" },
  { label: "Low Stock", value: "0", tone: "bg-amber" },
  { label: "Live Orders", value: "0", tone: "bg-rose" }
];

export function DashboardPage() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Operations Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Live sales, inventory, purchase orders, and cashier activity will converge here as modules are enabled.
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
            Realtime chart stream is ready for the reporting milestone.
          </div>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-bold">Priority Alerts</h3>
          <div className="mt-5 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <p className="rounded-md bg-slate-100 p-3 dark:bg-slate-800">No low-stock alerts.</p>
            <p className="rounded-md bg-slate-100 p-3 dark:bg-slate-800">No failed synchronizations.</p>
            <p className="rounded-md bg-slate-100 p-3 dark:bg-slate-800">No pending purchase receipts.</p>
          </div>
        </section>
      </div>
    </section>
  );
}
