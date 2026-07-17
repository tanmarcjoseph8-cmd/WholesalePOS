import type { LocalDatabase } from "../data/database";
import { APP_VERSION } from "../domain/app-metadata";
import { verifyOfflineActivation } from "../domain/license-code";
import { nowIso } from "../domain/models";
import { getLicenseDeviceId } from "../platform/device-identity";

export type MobileLicenseStatus = { state: "ACTIVE" | "UNACTIVATED" | "INVALID"; deviceId: string; appVersion: string; activatedOn: string | null; issuedOn: string | null; productName: string | null; edition: string | null; message: string | null };
type LicenseRow = { device_id: string; activation_code: string; activated_at: string; issued_at: string; product_name: string; edition: string };

/** Owns Android activation verification and persistence independently of POS business logic. */
export class LicenseService {
  constructor(private readonly db: LocalDatabase, private readonly deviceIdProvider = getLicenseDeviceId) {}

  /** Returns the current offline activation status and always includes the tablet Device ID. */
  async getStatus(): Promise<MobileLicenseStatus> {
    const deviceId = await this.deviceIdProvider();
    const rows = await this.db.query<LicenseRow>("SELECT device_id, activation_code, activated_at, issued_at, product_name, edition FROM license_state WHERE id='primary' LIMIT 1");
    const row = rows[0];
    if (!row) return { state: "UNACTIVATED", deviceId, appVersion: APP_VERSION, activatedOn: null, issuedOn: null, productName: null, edition: null, message: null };
    try {
      const payload = await verifyOfflineActivation(row.activation_code, deviceId);
      if (row.device_id !== deviceId) throw new Error("Saved activation belongs to a different tablet.");
      return { state: "ACTIVE", deviceId, appVersion: APP_VERSION, activatedOn: row.activated_at, issuedOn: row.issued_at, productName: payload.productName, edition: payload.edition, message: null };
    } catch (error) {
      return { state: "INVALID", deviceId, appVersion: APP_VERSION, activatedOn: null, issuedOn: null, productName: row.product_name, edition: row.edition, message: error instanceof Error ? error.message : "Saved activation is invalid." };
    }
  }

  /** Verifies and saves a manual or QR activation identically in one local transaction. */
  async activate(activationCode: string, qrDeviceId?: string) {
    const deviceId = await this.deviceIdProvider();
    if (qrDeviceId && qrDeviceId.trim().toUpperCase() !== deviceId) throw new Error("This QR code belongs to a different tablet.");
    const payload = await verifyOfflineActivation(activationCode.trim(), deviceId);
    const activatedAt = nowIso();
    await this.db.transaction(async () => {
      await this.db.run("DELETE FROM license_state WHERE id='primary'", [], false);
      await this.db.run(`INSERT INTO license_state(id, device_id, activation_code, license_id, product_id, product_name, product_version, edition, issued_at, activated_at, updated_at)
        VALUES ('primary', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [deviceId, activationCode.trim(), payload.licenseId, payload.productId, payload.productName, payload.productVersion, payload.edition, payload.issuedAt, activatedAt, activatedAt], false);
    });
    return this.getStatus();
  }
}
