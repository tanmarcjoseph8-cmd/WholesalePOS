import type { LocalDatabase } from "../data/database";
import { APP_VERSION } from "../domain/app-metadata";
import { daysRemaining, expirationOf, LICENSE_CLOCK_TOLERANCE_MS, LicenseValidationError, licenseTypeOf, verifyOfflineActivation, type ActivationPayload, type LicenseType } from "../domain/license-code";
import { nowIso } from "../domain/models";
import { getLicenseDeviceId } from "../platform/device-identity";
import { licenseSecureStore, type LicenseSecureStore } from "../platform/license-secure-store";

export type MobileLicenseState = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "CLOCK_INVALID" | "UNACTIVATED" | "INVALID";
export type MobileLicenseStatus = {
  state: MobileLicenseState;
  deviceId: string;
  appVersion: string;
  licenseId: string | null;
  activatedOn: string | null;
  issuedOn: string | null;
  productName: string | null;
  edition: string | null;
  licenseType: LicenseType | null;
  expirationDate: string | null;
  daysRemaining: number | null;
  warningThreshold: number | null;
  message: string | null;
};

type LicenseRow = { device_id: string; activation_code: string; activated_at: string; issued_at: string; product_name: string; edition: string };
type ValidationPurpose = "launch" | "resume" | "operation" | "display";
const WARNING_THRESHOLDS = [30, 14, 7, 3, 1] as const;

/** Returns whether a verified status permits protected application features. */
export function isUsableLicenseStatus(status: MobileLicenseStatus) {
  return status.state === "ACTIVE" || status.state === "EXPIRING_SOON";
}

/** Owns signed activation, secure time checks, renewal replacement, warnings, and protected-operation enforcement. */
export class LicenseService {
  constructor(private readonly db: LocalDatabase, private readonly deviceIdProvider = getLicenseDeviceId, private readonly secureStore: LicenseSecureStore = licenseSecureStore, private readonly clock = () => Date.now()) {}

  /** Returns current status after fresh signature, device, expiration, and rollback verification. */
  async getStatus(purpose: ValidationPurpose = "display"): Promise<MobileLicenseStatus> {
    const deviceId = await this.deviceIdProvider();
    const rows = await this.db.query<LicenseRow>("SELECT device_id, activation_code, activated_at, issued_at, product_name, edition FROM license_state WHERE id='primary' LIMIT 1");
    const row = rows[0];
    if (!row) return this.emptyStatus("UNACTIVATED", deviceId, null);
    const current = this.clock();
    const secure = await this.secureStore.getState();
    const effectiveNow = Math.max(current, secure.lastVerifiedTime ?? 0);
    try {
      const payload = await verifyOfflineActivation(row.activation_code, deviceId, undefined, effectiveNow);
      if (row.device_id !== deviceId) throw new LicenseValidationError("INVALID", "Saved activation belongs to a different tablet.");
      if (secure.lastVerifiedTime !== null && current + LICENSE_CLOCK_TOLERANCE_MS < secure.lastVerifiedTime) return this.payloadStatus("CLOCK_INVALID", deviceId, row, payload, "System time appears incorrect. Please correct your device date and time.", null);
      const expirationDate = expirationOf(payload);
      const remaining = daysRemaining(expirationDate, current);
      const state: MobileLicenseState = remaining !== null && remaining <= 30 ? "EXPIRING_SOON" : "ACTIVE";
      const secured = await this.secureStore.recordVerification(payload.licenseId, purpose === "launch");
      const threshold = state === "EXPIRING_SOON" ? this.warningThreshold(remaining!, secured.warningLicenseId === payload.licenseId ? secured.dismissedWarnings : []) : null;
      return this.payloadStatus(state, deviceId, row, payload, null, threshold);
    } catch (error) {
      if (error instanceof LicenseValidationError && error.reason === "EXPIRED" && error.payload) return this.payloadStatus("EXPIRED", deviceId, row, error.payload, "Your license has expired. Your business data is safe. Please obtain a renewal code to continue using the application.", null);
      console.warn("Offline license validation failed", error instanceof LicenseValidationError ? error.reason : "INVALID");
      return this.emptyStatus("INVALID", deviceId, "Activation could not be verified. Please enter a valid renewal code.", row);
    }
  }

  /** Verifies a new or renewed code and atomically replaces only the local entitlement record. */
  async activate(activationCode: string, qrDeviceId?: string) {
    const deviceId = await this.deviceIdProvider();
    if (qrDeviceId && qrDeviceId.trim().toUpperCase() !== deviceId) throw new Error("This QR code belongs to a different tablet.");
    const secure = await this.secureStore.getState();
    const current = this.clock();
    if (secure.lastVerifiedTime !== null && current + LICENSE_CLOCK_TOLERANCE_MS < secure.lastVerifiedTime) throw new Error("System time appears incorrect. Please correct your device date and time.");
    const payload = await verifyOfflineActivation(activationCode.trim(), deviceId, undefined, Math.max(current, secure.lastVerifiedTime ?? 0));
    const activatedAt = nowIso();
    const licenseType = licenseTypeOf(payload);
    const expirationDate = expirationOf(payload);
    const serialNumber = payload.version === 2 ? payload.licenseSerialNumber : payload.licenseId;
    await this.db.transaction(async () => {
      await this.db.run("DELETE FROM license_state WHERE id='primary'", [], false);
      await this.db.run(`INSERT INTO license_state(id, device_id, activation_code, license_id, product_id, product_name, product_version, edition, issued_at, activated_at, updated_at, license_type, expiration_at, license_serial_number)
        VALUES ('primary', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [deviceId, activationCode.trim(), payload.licenseId, payload.productId, payload.productName, payload.productVersion, payload.edition, payload.issuedAt, activatedAt, activatedAt, licenseType, expirationDate, serialNumber], false);
    });
    await this.secureStore.recordVerification(payload.licenseId, true);
    return this.getStatus("display");
  }

  /** Revalidates immediately before a protected mutation and blocks without modifying business data. */
  async requireProtectedOperation() {
    const status = await this.getStatus("operation");
    if (isUsableLicenseStatus(status)) return status;
    window.dispatchEvent(new CustomEvent("pos:license-status-changed", { detail: status }));
    throw new Error(status.message ?? "A valid license is required to continue.");
  }

  /** Dismisses one plan-expiration reminder for the current signed license only. */
  async dismissWarning(status: MobileLicenseStatus) {
    if (!status.licenseId || !status.warningThreshold) return status;
    await this.secureStore.dismissWarning(status.licenseId, status.warningThreshold);
    return this.getStatus("display");
  }

  private warningThreshold(remaining: number, dismissed: number[]) {
    const threshold = [...WARNING_THRESHOLDS].reverse().find((days) => remaining <= days) ?? null;
    return threshold !== null && !dismissed.includes(threshold) ? threshold : null;
  }

  private payloadStatus(state: MobileLicenseState, deviceId: string, row: LicenseRow, payload: ActivationPayload, message: string | null, warningThreshold: number | null): MobileLicenseStatus {
    const expirationDate = expirationOf(payload);
    return { state, deviceId, appVersion: APP_VERSION, licenseId: payload.licenseId, activatedOn: row.activated_at, issuedOn: payload.issuedAt, productName: payload.productName, edition: payload.edition, licenseType: licenseTypeOf(payload), expirationDate, daysRemaining: daysRemaining(expirationDate, this.clock()), warningThreshold, message };
  }

  private emptyStatus(state: "UNACTIVATED" | "INVALID", deviceId: string, message: string | null, row?: LicenseRow): MobileLicenseStatus {
    return { state, deviceId, appVersion: APP_VERSION, licenseId: null, activatedOn: null, issuedOn: row?.issued_at ?? null, productName: row?.product_name ?? null, edition: row?.edition ?? null, licenseType: null, expirationDate: null, daysRemaining: null, warningThreshold: null, message };
  }
}
