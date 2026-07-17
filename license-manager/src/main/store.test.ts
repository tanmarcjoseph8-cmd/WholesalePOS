import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateSigningAuthority } from "./crypto.js";
import { LicenseVaultStore } from "./store.js";

const password = "correct horse battery staple";

async function configuredStore() {
  const root = await mkdtemp(join(tmpdir(), "wpos-license-test-"));
  const store = new LicenseVaultStore(join(root, "license-manager.wposvault"), join(root, "backups"));
  const authority = generateSigningAuthority();
  await store.setup({ password, companyName: "WholesalePOS", contactInformation: "Manila", ...authority });
  return { root, store };
}

const input = { customerName: "Ana Santos", businessName: "Ana Store", contactNumber: "", email: "", customerNotes: "Paid in Full", deviceId: "WPOS-AAAA-BBBB", productId: "WHOLESALE_POS_ANDROID", appVersion: "0.7.0", licenseNotes: "Lifetime License", licenseType: "LIFETIME" as const };

describe("encrypted license store", () => {
  it("creates one signed license and blocks an accidental duplicate", async () => { const { store } = await configuredStore(); const created = await store.createLicense(input); expect(created.kind).toBe("CREATED"); const duplicate = await store.createLicense(input); expect(duplicate.kind).toBe("DUPLICATE"); expect(store.snapshot().licenses).toHaveLength(1); });
  it("reissues the exact code and records permanent history", async () => { const { store } = await configuredStore(); const created = await store.createLicense(input); if (created.kind !== "CREATED") throw new Error("fixture failed"); const reissued = await store.reissueLicense(created.license.id, "Customer reinstalled"); expect(reissued.activationCode).toBe(created.license.activationCode); expect(store.snapshot().activationEvents.map((event) => event.type)).toEqual(["GENERATED", "REISSUED"]); });
  it("preserves the replaced device and creates a separate replacement", async () => { const { store } = await configuredStore(); const created = await store.createLicense(input); if (created.kind !== "CREATED") throw new Error("fixture failed"); const replacement = await store.replaceDevice({ licenseId: created.license.id, newDeviceId: "WPOS-CCCC-DDDD", appVersion: "0.6.0", notes: "Tablet damaged" }); const snapshot = store.snapshot(); expect(snapshot.licenses).toHaveLength(2); expect(snapshot.licenses.find((license) => license.id === created.license.id)?.status).toBe("REPLACED"); expect(replacement.replacementForLicenseId).toBe(created.license.id); });
  it("renews the same device without overwriting its previous license", async () => { const { store } = await configuredStore(); const created = await store.createLicense({ ...input, licenseType: "MONTHLY" }); if (created.kind !== "CREATED") throw new Error("fixture failed"); const renewed = await store.renewLicense({ licenseId: created.license.id, deviceId: input.deviceId, licenseType: "YEARLY", administratorNotes: "Annual renewal paid" }); const snapshot = store.snapshot(); expect(snapshot.licenses).toHaveLength(2); expect(snapshot.licenses.find((license) => license.id === created.license.id)?.status).toBe("ARCHIVED"); expect(renewed.renewalForLicenseId).toBe(created.license.id); expect(snapshot.activationEvents.at(-1)?.type).toBe("RENEWED"); });
  it("writes only ciphertext to the vault file", async () => { const { root, store } = await configuredStore(); await store.createLicense(input); store.lock(); const raw = await readFile(join(root, "license-manager.wposvault"), "utf8"); expect(raw).not.toContain("Ana Santos"); expect(raw).not.toContain("PRIVATE KEY"); expect(raw).toContain("aes-256-gcm"); });
});
