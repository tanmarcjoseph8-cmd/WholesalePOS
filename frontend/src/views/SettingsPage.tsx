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
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Business, tax, receipt, printer, theme, and local backup controls.</p>
        </div>
        <button className="focus-ring inline-flex items-center gap-2 rounded-md bg-ocean px-4 py-2 text-sm font-bold text-white" onClick={() => saveMutation.mutate(form)}>
          <Save size={18} />
          Save
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-bold">Business</h3>
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
    </section>
  );
}
