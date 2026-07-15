import { useEffect, useState, type FormEvent } from "react";
import { ArchiveRestore, Database, Download, FileDown, Save, ShieldCheck, UserPlus } from "lucide-react";
import type { AppSettings, LocalUser } from "../../domain/models";
import { useOfflineApp } from "../app-context";
import { ConfirmDialog } from "../ConfirmDialog";

const today = () => new Date().toISOString().slice(0, 10);

export function SettingsView() {
  const { app, user, refresh, notify } = useOfflineApp();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [schemaVersion, setSchemaVersion] = useState(0);
  const [integrity, setIntegrity] = useState<boolean | null>(null);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const [busy, setBusy] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", login: "", secret: "", role: "CASHIER" as "CASHIER" | "MANAGER" });

  useEffect(() => {
    void Promise.all([app.settingsReports.getSettings(), app.auth.listUsers(), app.database.schemaVersion(), app.database.integrityCheck()]).then(([nextSettings, nextUsers, version, healthy]) => {
      setSettings(nextSettings); setUsers(nextUsers); setSchemaVersion(version); setIntegrity(healthy);
    });
  }, [app]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    try { await app.settingsReports.updateSettings(user, settings); document.documentElement.dataset.theme = settings.darkMode ? "dark" : "light"; refresh(); notify("Settings saved.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Settings could not be saved.", "error"); }
    finally { setBusy(false); }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { await app.auth.createUser(user, newUser); setUsers(await app.auth.listUsers()); setNewUser({ name: "", login: "", secret: "", role: "CASHIER" }); notify("Local user created.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "User could not be created.", "error"); }
    finally { setBusy(false); }
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { await action(); notify(success, "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "The operation failed.", "error"); }
    finally { setBusy(false); }
  }

  async function restore() {
    await run(async () => {
      await app.backup.restoreBackup(user, restoreText);
      setRestoreOpen(false);
      window.location.reload();
    }, "Backup restored.");
  }

  if (!settings) return <p className="loading">Loading settings...</p>;
  const canManage = user.permissions.includes("*") || user.permissions.includes("settings.manage");

  return (
    <section className="page-stack">
      <header className="page-header"><div><h2>Settings and data</h2><p>Business preferences, local users, exports, and device backups.</p></div></header>
      <div className="settings-grid">
        <form className="data-panel form-stack" onSubmit={saveSettings}><h3>Business</h3>
          <label>Business name<input value={settings.businessName} onChange={(event) => setSettings({ ...settings, businessName: event.target.value })} required /></label>
          <label>Operating mode<select value={settings.businessMode} onChange={(event) => setSettings({ ...settings, businessMode: event.target.value as AppSettings["businessMode"] })}><option value="RETAIL">Retail</option><option value="RESTAURANT">Restaurant</option><option value="HYBRID">Retail and restaurant</option></select></label>
          <label>Receipt paper<select value={settings.paperWidth} onChange={(event) => setSettings({ ...settings, paperWidth: event.target.value as AppSettings["paperWidth"] })}><option value="58mm">58 mm</option><option value="80mm">80 mm</option></select></label>
          <label>Receipt footer<input value={settings.receiptFooter} onChange={(event) => setSettings({ ...settings, receiptFooter: event.target.value })} /></label>
          <label>Service charge (%)<input type="number" min="0" max="100" step="0.01" value={settings.serviceChargeBasisPoints / 100} onChange={(event) => setSettings({ ...settings, serviceChargeBasisPoints: Math.round(Number(event.target.value) * 100) })} /></label>
          <label>Custom order types<input value={settings.customOrderTypes.join(", ")} onChange={(event) => setSettings({ ...settings, customOrderTypes: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="Curbside, Catering" /></label>
          <label className="toggle-row"><input type="checkbox" checked={settings.darkMode} onChange={(event) => setSettings({ ...settings, darkMode: event.target.checked })} /> Dark theme</label>
          <button className="button primary" disabled={!canManage || busy}><Save size={18} /> Save settings</button>
        </form>

        <section className="data-panel form-stack"><h3>Backups and exports</h3><p className="muted">Backups contain the entire encrypted-credential local database. Keep them in a trusted location.</p>
          <button className="button primary" disabled={!canManage || busy} onClick={() => void run(() => app.backup.createBackup(user), "Backup created and ready to share.")}><Download size={18} /> Full backup</button>
          <button className="button danger" disabled={!canManage || busy} onClick={() => { setRestoreText(""); setRestoreOpen(true); }}><ArchiveRestore size={18} /> Restore backup</button>
          <div className="date-range"><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>
          <button className="button secondary" disabled={busy || from > to} onClick={() => void run(() => app.importExport.exportSales(from, to), "Sales CSV created.")}><FileDown size={18} /> Export sales CSV</button>
          <button className="button secondary" disabled={busy} onClick={() => void run(() => app.importExport.exportProducts(), "Products CSV created.")}><FileDown size={18} /> Export products CSV</button>
          <button className="button secondary" disabled={busy} onClick={() => void run(() => app.importExport.exportInventory(), "Inventory CSV created.")}><FileDown size={18} /> Export inventory CSV</button>
          <div className={`health-status ${integrity ? "healthy" : "unhealthy"}`}><Database size={19} /><div><strong>{integrity ? "Database healthy" : "Database check failed"}</strong><span>Schema version {schemaVersion}</span></div></div>
        </section>

        <section className="data-panel user-panel"><h3><ShieldCheck size={19} /> Local users</h3><div className="user-list">{users.map((entry) => <article key={entry.id}><div><strong>{entry.name}</strong><span>@{entry.login}</span></div><b>{entry.role}</b></article>)}</div>
          {canManage ? <form className="form-stack compact" onSubmit={createUser}><h4>Add user</h4><label>Name<input value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} required /></label><label>Login<input value={newUser.login} onChange={(event) => setNewUser({ ...newUser, login: event.target.value })} autoCapitalize="none" required /></label><label>PIN or password<input type="password" minLength={4} value={newUser.secret} onChange={(event) => setNewUser({ ...newUser, secret: event.target.value })} required /></label><label>Role<select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as typeof newUser.role })}><option value="CASHIER">Cashier</option><option value="MANAGER">Manager</option></select></label><button className="button secondary" disabled={busy}><UserPlus size={18} /> Add user</button></form> : null}
        </section>
      </div>
      <ConfirmDialog open={restoreOpen} title="Replace all local data?" confirmLabel={busy ? "Restoring" : "Restore backup"} destructive disabled={busy || restoreText !== "RESTORE"} onClose={() => setRestoreOpen(false)} onConfirm={() => void restore()}><p>A safety backup will be offered first. The selected backup then replaces this tablet&apos;s products, stock, sales, orders, users, and settings.</p><label>Type RESTORE<input value={restoreText} onChange={(event) => setRestoreText(event.target.value)} autoCapitalize="characters" /></label></ConfirmDialog>
    </section>
  );
}
