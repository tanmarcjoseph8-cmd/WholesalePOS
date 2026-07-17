import { useEffect, useState } from "react";
import { BadgeCheck, Copy, KeyRound, RefreshCw } from "lucide-react";
import type { MobileLicenseStatus } from "../services/license-service";
import { useOfflineApp } from "./app-context";

/** Displays non-secret license details to administrators without exposing the activation code. */
/** Displays non-secret activation and device details for the current installation. */
export function AboutLicensePanel() {
  const { app } = useOfflineApp();
  const [status, setStatus] = useState<MobileLicenseStatus | null>(null);
  useEffect(() => { void app.license.getStatus().then(setStatus); }, [app]);
  return <section className="data-panel about-license-panel"><header><div><p className="eyebrow">Device information</p><h3><KeyRound size={19} /> About &amp; License</h3></div>{status?.state === "ACTIVE" ? <span className="license-active"><BadgeCheck size={17} /> Active</span> : null}</header>{!status ? <p className="loading"><RefreshCw className="spin" size={18} /> Loading license information</p> : <dl><dt>App version</dt><dd>{status.appVersion}</dd><dt>Device ID</dt><dd><code>{status.deviceId}</code><button type="button" className="icon-button" title="Copy Device ID" aria-label="Copy Device ID" onClick={() => void navigator.clipboard.writeText(status.deviceId)}><Copy size={17} /></button></dd><dt>Activation status</dt><dd>{status.state === "ACTIVE" ? "Activated" : "Activation required"}</dd><dt>Activated on</dt><dd>{status.activatedOn ? new Date(status.activatedOn).toLocaleString() : "Not activated"}</dd><dt>Licensed product</dt><dd>{status.productName ? `${status.productName}${status.edition ? ` | ${status.edition}` : ""}` : "Not available"}</dd></dl>}<p className="muted">The activation code is intentionally hidden after successful activation.</p></section>;
}
