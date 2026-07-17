import { describe, expect, it } from "vitest";
import type { ActivationPayload, LicenseVaultData } from "../shared/contracts.js";
import { createActivationCode, decryptVault, encryptVault, generateSigningAuthority, verifyActivationCode } from "./crypto.js";

const password = "correct horse battery staple";

function vault(): LicenseVaultData {
  const authority = generateSigningAuthority();
  return { schemaVersion: 1, authorityId: "authority", ...authority, customers: [], licenses: [], activationEvents: [], products: [], branding: { companyName: "WholesalePOS", contactInformation: "", logoDataUrl: "" }, preferences: { autoBackup: true, autoLockMinutes: 10 } };
}

describe("License Manager cryptography", () => {
  it("encrypts and decrypts the complete private vault", () => { const data = vault(); const unlocked = decryptVault(encryptVault(data, password), password); expect(unlocked.data.privateKeyPem).toBe(data.privateKeyPem); unlocked.key.fill(0); unlocked.salt.fill(0); });
  it("rejects the wrong administrator password", () => expect(() => decryptVault(encryptVault(vault(), password), "this password is incorrect")).toThrow("incorrect or the vault is damaged"));
  it("signs and verifies P-256 activation claims", () => { const authority = generateSigningAuthority(); const payload: ActivationPayload = { format: "WPOS-LICENSE", version: 1, licenseId: "license", deviceId: "DEVICE", productId: "PRODUCT", productName: "POS", productVersion: "1", edition: "Standard", issuedAt: new Date().toISOString() }; const code = createActivationCode(authority.privateKeyPem, payload); expect(verifyActivationCode(code, authority.publicKeyJwk)).toEqual(payload); });
  it("rejects a modified activation signature", () => { const authority = generateSigningAuthority(); const payload: ActivationPayload = { format: "WPOS-LICENSE", version: 1, licenseId: "license", deviceId: "DEVICE", productId: "PRODUCT", productName: "POS", productVersion: "1", edition: "Standard", issuedAt: new Date().toISOString() }; const code = createActivationCode(authority.privateKeyPem, payload); const [prefix, claims, encodedSignature] = code.split("."); const signature = Buffer.from(encodedSignature!, "base64url"); signature[0] = (signature[0] ?? 0) ^ 1; const tampered = `${prefix}.${claims}.${signature.toString("base64url")}`; expect(() => verifyActivationCode(tampered, authority.publicKeyJwk)).toThrow("signature"); });
  it("signs every renewable term and expiration field", () => { const authority = generateSigningAuthority(); const payload: ActivationPayload = { format: "WPOS-LICENSE", version: 2, licenseId: "license", licenseSerialNumber: "WPOS-2026-ABC", customerId: "customer", deviceId: "DEVICE", productId: "PRODUCT", productName: "POS", productVersion: "2", edition: "Standard", licenseType: "YEARLY", issuedAt: "2026-07-01T00:00:00.000Z", expiresAt: "2027-07-01T00:00:00.000Z" }; const code = createActivationCode(authority.privateKeyPem, payload); expect(verifyActivationCode(code, authority.publicKeyJwk)).toEqual(payload); });
});
