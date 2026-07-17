import { useEffect, useState } from "react";
import { BadgeCheck, Copy, KeyRound, RefreshCw } from "lucide-react";
import type { MobileLicenseStatus } from "../services/license-service";
import { useOfflineApp } from "./app-context";

/** Displays non-secret activation and device details for the current installation. */
export function AboutLicensePanel() {
  const { app } = useOfflineApp();
  const [status, setStatus] = useState<MobileLicenseStatus | null>(null);
  useEffect(() => { void app.license.getStatus().then(setStatus); }, [app]);
  const label = status?.licenseType === "LIFETIME" ? "Lifetime" : status?.state === "EXPIRING_SOON" ? "Expiring Soon" : status?.state === "ACTIVE" ? "Active" : status?.state === "EXPIRED" ? "Expired" : status?.state === "CLOCK_INVALID" ? "Check Device Time" : "Activation Required";
  return <section className="data-panel about-license-panel"><header><div><p className="eyebrow">Device information</p><h3><KeyRound size={19} /> About &amp; License</h3></div>{status && (status.state === "ACTIVE" || status.state === "EXPIRING_SOON") ? <span className="license-active"><BadgeCheck size={17} /> {label}</span> : null}</header>{!status ? <p className="loading"><RefreshCw className="spin" size={18} /> Loading license information</p> : <dl><dt>Product name</dt><dd>{status.productName ? `${status.productName}${status.edition ? ` | ${status.edition}` : ""}` : "Not available"}</dd><dt>Product version</dt><dd>{status.appVersion}</dd><dt>Device ID</dt><dd><code>{status.deviceId}</code><button type="button" className="icon-button" title="Copy Device ID" aria-label="Copy Device ID" onClick={() => void navigator.clipboard.writeText(status.deviceId)}><Copy size={17} /></button></dd><dt>License type</dt><dd>{status.licenseType ? status.licenseType[0] + status.licenseType.slice(1).toLowerCase() : "Not activated"}</dd><dt>Activation date</dt><dd>{status.activatedOn ? new Date(status.activatedOn).toLocaleString() : "Not activated"}</dd><dt>Expiration date</dt><dd>{status.licenseType === "LIFETIME" ? "Lifetime" : status.expirationDate ? new Date(status.expirationDate).toLocaleString() : "Not available"}</dd><dt>Days remaining</dt><dd>{status.licenseType === "LIFETIME" ? "Unlimited" : status.daysRemaining ?? "Not available"}</dd><dt>License status</dt><dd>{label}</dd></dl>}<p className="muted">The activation code and signature are intentionally hidden after successful activation.</p></section>;
}
