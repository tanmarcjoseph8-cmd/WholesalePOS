import { Device } from "@capacitor/device";

/** Derives a non-secret display Device ID from Android's app-scoped stable identifier. */
export async function formatLicenseDeviceId(identifier: string) {
  const bytes = new TextEncoder().encode(`WholesalePOS Android license device v1:${identifier}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const value = [...digest.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `WPOS-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 24)}`;
}

/** Returns the stable license Device ID for this signed Android app on this tablet. */
export async function getLicenseDeviceId() {
  const result = await Device.getId();
  if (!result.identifier) throw new Error("Android could not provide a stable Device ID.");
  return formatLicenseDeviceId(result.identifier);
}
