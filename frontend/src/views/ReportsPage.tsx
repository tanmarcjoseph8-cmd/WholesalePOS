import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { exportReport, fetchReportOverview, type ReportPeriod } from "../lib/api";
import { formatCurrency } from "../lib/currency";

const periods: Array<{ value: ReportPeriod; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" }
];

function downloadFile(fileName: string, mimeType: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const reports = useQuery({ queryKey: ["reports", period], queryFn: () => fetchReportOverview({ period }) });
  const exportMutation = useMutation({
    mutationFn: exportReport,
    onSuccess: (file) => downloadFile(file.fileName, file.mimeType, file.content)
  });
  const summary = reports.data?.summary;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Reports</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Sales, profit, payment, cashier, best seller, and inventory reporting from this device.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="focus-ring h-10 rounded-md border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            value={period}
            onChange={(event) => setPeriod(event.target.value as ReportPeriod)}
          >
            {periods.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold dark:border-slate-700"
            onClick={() => exportMutation.mutate({ period, format: "excel" })}
          >
            <Download size={17} />
            Excel
          </button>
          <button
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-ocean px-3 text-sm font-bold text-white"
            onClick={() => exportMutation.mutate({ period, format: "pdf" })}
          >
            <FileText size={17} />
            PDF
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Sales", summary?.salesCount.toLocaleString() ?? "0"],
          ["Revenue", formatCurrency(summary?.revenue ?? 0)],
          ["Gross Profit", formatCurrency(summary?.grossProfit ?? 0)],
          ["Average Sale", formatCurrency(summary?.averageSale ?? 0)],
          ["Inventory Value", formatCurrency(summary?.inventoryValue ?? 0)],
          ["Low Stock", (summary?.lowStockCount ?? 0).toLocaleString()]
        ].map(([label, value]) => (
          <article key={label} className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-bold">{value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h3 className="font-bold">Best Sellers</h3>
          </div>
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Revenue</th>
                <th className="px-4 py-3">Profit</th>
              </tr>
            </thead>
            <tbody>
              {reports.data?.bestSellers.length ? (
                reports.data.bestSellers.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 font-semibold">{item.name}</td>
                    <td className="px-4 py-3">{item.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                    <td className="px-4 py-3">{formatCurrency(item.revenue)}</td>
                    <td className="px-4 py-3">{formatCurrency(item.profit)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                    No sales in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h3 className="font-bold">Cashiers and Payments</h3>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <div className="space-y-2">
              {reports.data?.cashierSales.map((item) => (
                <div key={item.id} className="flex justify-between rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
                  <span>{item.name}</span>
                  <strong>{formatCurrency(item.revenue)}</strong>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {reports.data?.paymentSummary.map((item) => (
                <div key={item.id} className="flex justify-between rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
                  <span>{item.method}</span>
                  <strong>{formatCurrency(item.amount)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="font-bold">Inventory Report</h3>
        </div>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Warehouse</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Alert</th>
            </tr>
          </thead>
          <tbody>
            {reports.data?.inventoryReport.map((item) => (
              <tr key={`${item.productId}-${item.warehouse}`} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-3 font-semibold">{item.name}</td>
                <td className="px-4 py-3">{item.warehouse}</td>
                <td className="px-4 py-3">
                  {item.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.unit.toLowerCase()}
                </td>
                <td className="px-4 py-3">{formatCurrency(item.value)}</td>
                <td className="px-4 py-3">{item.alert}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
