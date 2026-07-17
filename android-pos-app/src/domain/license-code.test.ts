import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseActivationQr, verifyOfflineActivation, type ActivationPayload } from "./license-code";

function codeFor(payload: ActivationPayload) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const text = JSON.stringify(payload);
  const signature = sign("sha256", Buffer.from(text), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return { code: `WPOS1.${Buffer.from(text).toString("base64url")}.${signature.toString("base64url")}`, publicKey: publicKey.export({ format: "jwk" }) as JsonWebKey };
}

const payload: ActivationPayload = { format: "WPOS-LICENSE", version: 1, licenseId: "license-1", deviceId: "WPOS-AAAA-BBBB", productId: "WHOLESALE_POS_ANDROID", productName: "WholesalePOS Android", productVersion: "0.6.0", edition: "Restaurant", issuedAt: new Date(Date.now() - 1000).toISOString() };
const renewablePayload: ActivationPayload = { format: "WPOS-LICENSE", version: 2, licenseId: "license-2", licenseSerialNumber: "WPOS-2026-ABC123", customerId: "customer-1", deviceId: "WPOS-AAAA-BBBB", productId: "WHOLESALE_POS_ANDROID", productName: "WholesalePOS Android", productVersion: "0.7.0", edition: "Restaurant", licenseType: "MONTHLY", issuedAt: "2026-07-01T00:00:00.000Z", expiresAt: "2026-08-01T00:00:00.000Z" };

describe("offline activation", () => {
  it("verifies a matching P-256 activation code", async () => { const signed = codeFor(payload); await expect(verifyOfflineActivation(signed.code, payload.deviceId, signed.publicKey)).resolves.toEqual(payload); });
  it("rejects use on a different tablet", async () => { const signed = codeFor(payload); await expect(verifyOfflineActivation(signed.code, "WPOS-OTHER", signed.publicKey)).rejects.toThrow("different tablet"); });
  it("rejects tampering", async () => { const signed = codeFor(payload); await expect(verifyOfflineActivation(`${signed.code}A`, payload.deviceId, signed.publicKey)).rejects.toThrow(); });
  it("parses the QR envelope", () => expect(parseActivationQr(JSON.stringify({ deviceId: "wpos-aaaa-bbbb", activationCode: " code " }))).toEqual({ deviceId: "WPOS-AAAA-BBBB", activationCode: "code" }));
  it("verifies a signed renewable license before expiration", async () => { const signed = codeFor(renewablePayload); await expect(verifyOfflineActivation(signed.code, renewablePayload.deviceId, signed.publicKey, Date.parse("2026-07-15T00:00:00.000Z"))).resolves.toEqual(renewablePayload); });
  it("rejects a renewable license after its signed expiration", async () => { const signed = codeFor(renewablePayload); await expect(verifyOfflineActivation(signed.code, renewablePayload.deviceId, signed.publicKey, Date.parse("2026-08-01T00:00:00.001Z"))).rejects.toThrow("expired"); });
  it("rejects an unknown signed payload version", async () => { const signed = codeFor({ ...renewablePayload, version: 3 } as unknown as ActivationPayload); await expect(verifyOfflineActivation(signed.code, renewablePayload.deviceId, signed.publicKey, Date.parse("2026-07-15T00:00:00.000Z"))).rejects.toThrow("invalid"); });
});
