export function PosPage() {
  return (
    <section className="grid min-h-[calc(100vh-8rem)] gap-4 xl:grid-cols-[1fr_420px]">
      <div className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Point of Sale</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Touch-first checkout workspace with barcode-ready search.</p>
          </div>
          <button className="focus-ring rounded-md bg-ocean px-4 py-2 text-sm font-bold text-white">New Sale</button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {["Favorites", "Categories", "Barcode Scan", "Held Orders", "Returns", "Discounts"].map((label) => (
            <button
              key={label}
              className="focus-ring h-24 rounded-md border border-slate-200 bg-slate-50 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <aside className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-lg font-bold">Current Cart</h3>
        <div className="mt-5 grid h-64 place-items-center rounded-md border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No items added.
        </div>
        <div className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><strong>PHP 0.00</strong></div>
          <div className="flex justify-between"><span>Tax</span><strong>PHP 0.00</strong></div>
          <div className="flex justify-between text-lg"><span>Total</span><strong>PHP 0.00</strong></div>
        </div>
        <button className="focus-ring mt-5 w-full rounded-md bg-mint px-4 py-3 text-sm font-bold text-white">Checkout</button>
      </aside>
    </section>
  );
}
