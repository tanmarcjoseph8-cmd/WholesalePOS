import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, CheckCircle2, Copy, KeyRound, ScanLine, ShieldCheck, X } from "lucide-react";
import { parseActivationQr } from "../domain/license-code";
import type { MobileLicenseStatus } from "../services/license-service";
import type { OfflinePosApplication } from "../services/offline-app";

/** Blocks application startup until a signed license for this tablet is entered or scanned. */
export function ActivationScreen({ app, status, onActivated }: { app: OfflinePosApplication; status: MobileLicenseStatus; onActivated: (status: MobileLicenseStatus) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(status.message ?? "");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop(): void } | null>(null);

  useEffect(() => () => controlsRef.current?.stop(), []);

  async function activate(activationCode: string, qrDeviceId?: string) {
    setBusy(true); setError("");
    try { onActivated(await app.license.activate(activationCode, qrDeviceId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Activation failed."); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) { event.preventDefault(); await activate(code); }
  function stopScanner() { controlsRef.current?.stop(); controlsRef.current = null; setScanning(false); }

  async function startScanner() {
    setError(""); setScanning(true);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
      if (!videoRef.current) throw new Error("Camera preview could not start.");
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (!result) return;
        try {
          const qr = parseActivationQr(result.getText());
          setCode(qr.activationCode);
          stopScanner();
          void activate(qr.activationCode, qr.deviceId);
        } catch (caught) { setError(caught instanceof Error ? caught.message : "This QR code is not a WholesalePOS activation."); }
      });
    } catch (caught) { stopScanner(); setError(caught instanceof Error ? caught.message : "Camera scanning is unavailable. Enter the code manually."); }
  }

  return <main className="activation-page"><section className="activation-panel"><header><div className="activation-mark"><ShieldCheck size={28} /></div><div><p className="eyebrow">WholesalePOS Offline</p><h1>Activate this tablet</h1></div></header><p className="muted">Activation is verified on this device without internet access.</p>
    <div className="device-license-box"><div><small>Device ID</small><code>{status.deviceId}</code></div><button type="button" className="icon-button" title="Copy Device ID" aria-label="Copy Device ID" onClick={() => void navigator.clipboard.writeText(status.deviceId)}><Copy size={19} /></button></div>
    <div className="activation-meta"><span>App version <strong>{status.appVersion}</strong></span><span>Status <strong>{status.state === "INVALID" ? "Activation required" : "Not activated"}</strong></span></div>
    {scanning ? <section className="qr-scanner"><video ref={videoRef} muted playsInline /><div className="scan-frame"><ScanLine /></div><button className="button secondary" type="button" onClick={stopScanner}><X size={18} /> Stop camera</button></section> : <button className="button secondary full" type="button" disabled={busy} onClick={() => void startScanner()}><Camera size={19} /> Scan activation QR code</button>}
    <div className="or-divider"><span>or enter manually</span></div>
    <form className="form-stack" onSubmit={submit}><label>Activation code<textarea value={code} onChange={(event) => setCode(event.target.value)} rows={5} required autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="WPOS1..." /></label>{error ? <p className="form-error">{error}</p> : null}<button className="button primary" disabled={busy || !code.trim()}><KeyRound size={19} /> {busy ? "Verifying activation" : "Activate offline"}</button></form>
    <footer><CheckCircle2 size={17} /><span>The activation code is not shown again inside the Android app after success.</span></footer>
  </section></main>;
}
