import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, LoaderCircle, RotateCcw, ShieldAlert, X } from "lucide-react";
import { canAccessFactoryReset, canContinueWithoutBackup, FACTORY_RESET_PHRASE, isFactoryResetPhrase, nextFactoryResetStep } from "../domain/factory-reset-rules";
import type { FactoryResetPreview, FactoryResetProgress } from "../services/factory-reset-service";
import { useOfflineApp } from "./app-context";

type ResetStep = "warning" | "reauthenticate" | "phrase" | "final" | "resetting" | "success";

const progressSteps: FactoryResetProgress[] = [
  "Creating backup", "Clearing orders", "Clearing sales", "Clearing inventory", "Clearing users", "Clearing settings", "Finishing reset"
];

export function FactoryResetPanel() {
  const { app, user, notify, restartAfterFactoryReset } = useOfflineApp();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ResetStep>("warning");
  const [secret, setSecret] = useState("");
  const [phrase, setPhrase] = useState("");
  const [createBackup, setCreateBackup] = useState(true);
  const [acknowledgedNoBackup, setAcknowledgedNoBackup] = useState(false);
  const [preview, setPreview] = useState<FactoryResetPreview | null>(null);
  const [progress, setProgress] = useState<FactoryResetProgress | null>(null);
  const [backupLocation, setBackupLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!canAccessFactoryReset(user)) return null;

  function resetWizard() {
    setOpen(false); setStep("warning"); setSecret(""); setPhrase(""); setCreateBackup(true); setAcknowledgedNoBackup(false);
    setPreview(null); setProgress(null); setBackupLocation(""); setError(""); setBusy(false);
  }

  async function verifyOwner() {
    setBusy(true); setError("");
    try { await app.factoryReset.reauthenticate(user, secret); setStep("phrase"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Owner authentication failed."); }
    finally { setBusy(false); }
  }

  async function loadFinalConfirmation() {
    setBusy(true); setError("");
    try { setPreview(await app.factoryReset.preview(user)); setStep("final"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Reset totals could not be loaded."); }
    finally { setBusy(false); }
  }

  async function eraseAllData() {
    setBusy(true); setError(""); setStep("resetting"); setProgress(createBackup ? "Creating backup" : "Clearing sales");
    try {
      const result = await app.factoryReset.execute(user, {
        secret, confirmationPhrase: phrase, finalConfirmed: true, createBackup, acknowledgedNoBackup
      }, setProgress);
      setBackupLocation(result.backup?.uri ?? "");
      setStep("success");
      window.setTimeout(restartAfterFactoryReset, 2400);
    } catch (caught) {
      setStep("final");
      setError(caught instanceof Error ? caught.message : "Factory reset could not be completed.");
      notify("Factory reset was stopped. Review the message and try again.", "error");
    } finally { setBusy(false); }
  }

  return <>
    <section className="data-panel advanced-settings">
      <header><div><span className="eyebrow">Advanced</span><h3>Factory Reset</h3><p>Permanently erase this tablet&apos;s local business data and return to first setup.</p></div><ShieldAlert size={24} /></header>
      <button className="button danger" onClick={() => setOpen(true)}><RotateCcw size={18} /> Open Factory Reset</button>
    </section>
    {open ? <div className="dialog-backdrop factory-reset-backdrop" role="presentation">
      <section className="dialog factory-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="factory-reset-title">
        {step !== "resetting" && step !== "success" ? <button className="factory-reset-close" aria-label="Close Factory Reset" onClick={resetWizard}><X size={20} /></button> : null}
        {step === "warning" ? <>
          <ResetHeading eyebrow="Settings / Advanced" title="Factory Reset" danger />
          <div className="factory-reset-warning"><strong>This will permanently erase all local business data from this device.</strong><p>Deleted data cannot be recovered unless a backup is created first.</p><p>The app&apos;s features and functions will remain installed.</p></div>
          <div className="factory-reset-lists"><div><h3>Data deleted</h3><ul><li>Products, categories, barcodes, stock and movements</li><li>Orders, tables, sales, payments, refunds and receipts</li><li>Cash drawers, alerts, imports, users and business settings</li><li>Generated reports and other local business files</li></ul></div><div><h3>Functions preserved</h3><ul><li>POS, inventory and product management</li><li>Restaurant, tables, payments and cash drawer</li><li>Reports, PDF export, alerts and notifications</li><li>Database schema, migrations, roles and app design</li></ul></div></div>
          <label className="toggle-row reset-backup-toggle"><input type="checkbox" checked={createBackup} onChange={(event) => { setCreateBackup(event.target.checked); if (event.target.checked) setAcknowledgedNoBackup(false); }} /><span><strong>Create backup before reset</strong><small>Saved and verified in persistent external app storage.</small></span></label>
          {!createBackup ? <label className="reset-acknowledgement"><input type="checkbox" checked={acknowledgedNoBackup} onChange={(event) => setAcknowledgedNoBackup(event.target.checked)} /> I understand that deleted data cannot be recovered.</label> : null}
          <div className="dialog-actions"><button className="button ghost" onClick={resetWizard}>Cancel</button><button className="button primary" disabled={!canContinueWithoutBackup(createBackup, acknowledgedNoBackup)} onClick={() => setStep(nextFactoryResetStep("warning"))}>Continue</button></div>
        </> : null}
        {step === "reauthenticate" ? <>
          <ResetHeading eyebrow="Step 2 of 4" title="Verify Owner" />
          <p>Enter the PIN or password for <strong>{user.name}</strong>. The value is checked securely and is never displayed or logged.</p>
          <label>Owner PIN or password<input autoFocus type="password" value={secret} minLength={4} autoComplete="current-password" onChange={(event) => setSecret(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && secret.length >= 4) void verifyOwner(); }} /></label>
          {error ? <p className="error-banner">{error}</p> : null}
          <div className="dialog-actions"><button className="button ghost" onClick={() => { setError(""); setStep("warning"); }}>Go Back</button><button className="button primary" disabled={busy || secret.length < 4} onClick={() => void verifyOwner()}>{busy ? "Verifying" : "Verify Owner"}</button></div>
        </> : null}
        {step === "phrase" ? <>
          <ResetHeading eyebrow="Step 3 of 4" title="Typed Confirmation" />
          <p>Type <strong>{FACTORY_RESET_PHRASE}</strong> to confirm.</p>
          <label>Confirmation phrase<input autoFocus value={phrase} autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={(event) => setPhrase(event.target.value)} /></label>
          {error ? <p className="error-banner">{error}</p> : null}
          <div className="dialog-actions"><button className="button ghost" onClick={() => setStep("reauthenticate")}>Go Back</button><button className="button primary" disabled={busy || !isFactoryResetPhrase(phrase)} onClick={() => void loadFinalConfirmation()}>{busy ? "Loading totals" : "Review Final Totals"}</button></div>
        </> : null}
        {step === "final" && preview ? <>
          <ResetHeading eyebrow="Step 4 of 4" title="Final Confirmation" danger />
          <p><strong>This action cannot be undone without a backup.</strong></p>
          <div className="reset-count-grid"><span>Products<strong>{preview.products}</strong></span><span>Sales<strong>{preview.sales}</strong></span><span>Users<strong>{preview.users}</strong></span><span>Orders<strong>{preview.orders}</strong></span><span>Cash sessions<strong>{preview.cashSessions}</strong></span><span>Backup<strong>{createBackup ? "Yes" : "No"}</strong></span></div>
          {preview.hasOpenCashDrawer || preview.unpaidOrders > 0 ? <div className="factory-reset-warning compact"><strong>Unfinished business requires attention</strong>{preview.hasOpenCashDrawer ? <p>An active cash drawer will be erased without being closed.</p> : null}{preview.unpaidOrders > 0 ? <p>{preview.unpaidOrders} unpaid order{preview.unpaidOrders === 1 ? "" : "s"} will be erased without being finalized.</p> : null}</div> : null}
          {error ? <p className="error-banner">{error}</p> : null}
          <div className="dialog-actions"><button className="button ghost" disabled={busy} onClick={() => { setError(""); setStep("phrase"); }}>Go Back</button><button className="button danger" disabled={busy} onClick={() => void eraseAllData()}>{busy ? "Preparing reset" : "Erase All Data"}</button></div>
        </> : null}
        {step === "resetting" ? <div className="factory-reset-progress"><LoaderCircle className="spin" size={36} /><span className="eyebrow">Do not close the app</span><h2 id="factory-reset-title">Resetting application</h2><div>{progressSteps.filter((item) => createBackup || item !== "Creating backup").map((item) => { const currentIndex = progress ? progressSteps.indexOf(progress) : 0; const itemIndex = progressSteps.indexOf(item); return <span className={itemIndex < currentIndex ? "done" : item === progress ? "active" : ""} key={item}>{itemIndex < currentIndex ? <Check size={17} /> : <i />}{item}{item === progress ? "..." : ""}</span>; })}</div></div> : null}
        {step === "success" ? <div className="factory-reset-success"><CheckCircle2 size={44} /><h2 id="factory-reset-title">Factory reset complete</h2><p>All local business data has been erased.<br />The app will now restart.</p>{backupLocation ? <small>Backup verified at<br />{backupLocation}</small> : null}</div> : null}
      </section>
    </div> : null}
  </>;
}

function ResetHeading({ eyebrow, title, danger = false }: { eyebrow: string; title: string; danger?: boolean }) {
  return <div className={`factory-reset-heading ${danger ? "danger" : ""}`}>{danger ? <AlertTriangle size={28} /> : <ShieldAlert size={28} />}<div><span className="eyebrow">{eyebrow}</span><h2 id="factory-reset-title">{title}</h2></div></div>;
}
