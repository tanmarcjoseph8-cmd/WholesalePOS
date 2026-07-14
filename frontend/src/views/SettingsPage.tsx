import { RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBackup, fetchBackups, fetchSettings, restoreBackup, updateSettings, type AppSettings } from "../lib/api";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const backups = useQuery({ queryKey: ["backups"], queryFn: fetchBackups });
  const [form, setForm] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: async (saved) => {
      setForm(saved);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    }
  });
  const backupMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["backups"] })
  });
  const restoreMutation = useMutation({ mutationFn: restoreBackup });

  if (!form) {
    return <div className="grid h-72 place-items-center text-sm text-slate-500">Loading settings...</div>;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Business, inventory, restaurant, tax, printing, and local backup controls.</p>
        </div>
        <button className="focus-ring inline-flex items-center gap-2 rounded-md bg-ocean px-4 py-2 text-sm font-bold text-white" onClick={() => saveMutation.mutate(form)}>
          <Save size={18} />
          Save
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-bold">Business</h3>
          <div className="mt-4">
            <span className="text-sm font-semibold">Business mode</span>
            <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
              {(["RETAIL", "RESTAURANT", "HYBRID"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`focus-ring h-11 px-2 text-sm font-bold ${form.businessMode.mode === mode ? "bg-ocean text-white" : "bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
                  onClick={() => setForm({ ...form, businessMode: { mode } })}
                >
                  {mode === "RETAIL" ? "Retail" : mode === "RESTAURANT" ? "Restaurant" : "Hybrid"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">
              Name
              <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.business.name} onChange={(event) => setForm({ ...form, business: { ...form.business, name: event.target.value } })} />
            </label>
            <label className="text-sm font-semibold">
              Phone
              <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.business.phone} onChange={(event) => setForm({ ...form, business: { ...form.business, phone: event.target.value } })} />
            </label>
            <label className="text-sm font-semibold">
              Email
              <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.business.email} onChange={(event) => setForm({ ...form, business: { ...form.business, email: event.target.value } })} />
            </label>
            <label className="text-sm font-semibold">
              Address
              <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.business.address} onChange={(event) => setForm({ ...form, business: { ...form.business, address: event.target.value } })} />
            </label>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-bold">Inventory Import</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">
              Batch size
              <input
                className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
                type="number"
                min="25"
                max="1000"
                step="25"
                value={form.inventoryImport.batchSize}
                onChange={(event) => setForm({ ...form, inventoryImport: { ...form.inventoryImport, batchSize: Number(event.target.value) } })}
              />
            </label>
            <label className="text-sm font-semibold">
              Default import mode
              <select
                className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
                value={form.inventoryImport.defaultMode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    inventoryImport: {
                      ...form.inventoryImport,
                      defaultMode: event.target.value as AppSettings["inventoryImport"]["defaultMode"]
                    }
                  })
                }
              >
                <option value="ADD_NEW">Add new products</option>
                <option value="UPDATE_EXISTING">Update existing products</option>
                <option value="ADD_AND_UPDATE">Add and update products</option>
                <option value="ADD_STOCK">Add stock</option>
                <option value="REPLACE_STOCK">Replace stock</option>
                <option value="ADJUST_STOCK">Stock adjustment</option>
                <option value="INITIAL_INVENTORY">Initial inventory</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2">
              <input
                type="checkbox"
                checked={form.inventoryImport.preventDuplicateFiles}
                onChange={(event) =>
                  setForm({ ...form, inventoryImport: { ...form.inventoryImport, preventDuplicateFiles: event.target.checked } })
                }
              />
              Prevent duplicate file imports
            </label>
          </div>
        </section>

        {form.businessMode.mode !== "RETAIL" ? (
          <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-bold">Restaurant</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {([
                ["enableTables", "Enable tables"],
                ["allowWalkInOrders", "Allow walk-in orders"],
                ["enableDelivery", "Enable delivery"],
                ["enableTakeout", "Enable takeout"],
                ["enableKitchenTickets", "Enable kitchen tickets"],
                ["splitBilling", "Allow split billing"],
                ["partialPayments", "Allow partial payments"]
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={form.restaurant[key]}
                    onChange={(event) => setForm({ ...form, restaurant: { ...form.restaurant, [key]: event.target.checked } })}
                  />
                  {label}
                </label>
              ))}
              <label className="text-sm font-semibold">
                Service charge
                <div className="relative mt-2">
                  <input
                    className="focus-ring h-11 w-full rounded-md border border-slate-200 px-3 pr-10 dark:border-slate-700 dark:bg-slate-800"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.restaurant.serviceChargeRate * 100}
                    onChange={(event) =>
                      setForm({ ...form, restaurant: { ...form.restaurant, serviceChargeRate: Number(event.target.value) / 100 } })
                    }
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">%</span>
                </div>
              </label>
              <label className="text-sm font-semibold">
                Order number format
                <input
                  className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
                  value={form.restaurant.orderNumberFormat}
                  onChange={(event) => setForm({ ...form, restaurant: { ...form.restaurant, orderNumberFormat: event.target.value } })}
                />
              </label>
              <label className="text-sm font-semibold md:col-span-2">Custom order types<input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" placeholder="Curbside, Catering, Staff meal" value={form.restaurant.customOrderTypes.join(", ")} onChange={(event) => setForm({ ...form, restaurant: { ...form.restaurant, customOrderTypes: [...new Set(event.target.value.split(",").map((value) => value.trim()).filter(Boolean))].slice(0, 20) } })} /></label>
            </div>
          </section>
        ) : null}

        <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-bold">Tax and Receipt</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">
              VAT rate
              <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" type="number" min="0" max="1" step="0.01" value={form.tax.vatRate} onChange={(event) => setForm({ ...form, tax: { ...form.tax, vatRate: Number(event.target.value) } })} />
            </label>
            <label className="text-sm font-semibold">
              Receipt paper
              <select className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.receipt.paperWidth} onChange={(event) => setForm({ ...form, receipt: { ...form.receipt, paperWidth: event.target.value as "58mm" | "80mm" } })}>
                <option value="80mm">80mm</option>
                <option value="58mm">58mm</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.tax.pricesIncludeVat} onChange={(event) => setForm({ ...form, tax: { ...form.tax, pricesIncludeVat: event.target.checked } })} />
              Prices include VAT
            </label>
            <label className="text-sm font-semibold">
              Receipt footer
              <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.receipt.footer} onChange={(event) => setForm({ ...form, receipt: { ...form.receipt, footer: event.target.value } })} />
            </label>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-bold">Printer and Theme</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">
              Printer name
              <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.printer.printerName} onChange={(event) => setForm({ ...form, printer: { ...form.printer, printerName: event.target.value } })} />
            </label>
            <label className="text-sm font-semibold">
              Printer type
              <select className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.printer.printerType} onChange={(event) => setForm({ ...form, printer: { ...form.printer, printerType: event.target.value as "WINDOWS" | "ESC_POS" } })}>
                <option value="WINDOWS">Windows</option>
                <option value="ESC_POS">ESC/POS</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Theme
              <select className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.theme.mode} onChange={(event) => setForm({ ...form, theme: { mode: event.target.value as "light" | "dark" | "system" } })}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">Backups</h3>
            <button className="focus-ring inline-flex items-center gap-2 rounded-md bg-mint px-3 py-2 text-sm font-bold text-white" onClick={() => backupMutation.mutate()} disabled={backupMutation.isPending}>
              <ShieldCheck size={17} />
              Back Up Now
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {backups.data?.map((backup) => (
              <div key={backup.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
                <span>
                  {new Date(backup.startedAt).toLocaleString()} - {backup.status}
                </span>
                <button className="focus-ring inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700" onClick={() => restoreMutation.mutate(backup.id)} disabled={backup.status !== "COMPLETED"}>
                  <RotateCcw size={15} />
                  Restore
                </button>
              </div>
            ))}
          </div>
          {restoreMutation.data?.requiresRestart ? <p className="mt-3 rounded-md bg-amber/10 p-3 text-sm font-semibold text-amber">Restore completed. Close and reopen WholesalePOS to reload the restored database.</p> : null}
        </section>
      </div>
      {saveMutation.error ? <p className="rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose">{saveMutation.error.message}</p> : null}
    </section>
  );
}
