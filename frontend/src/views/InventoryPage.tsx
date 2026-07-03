export function InventoryPage() {
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Inventory Control</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Permanent stock movements, warehouse balances, adjustments, and FIFO valuation.
          </p>
        </div>
        <button className="focus-ring rounded-md bg-ocean px-4 py-2 text-sm font-bold text-white">Receive Stock</button>
      </div>
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Warehouse</th>
              <th className="px-4 py-3">Available</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={5}>
                Inventory records will appear after products are created.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
