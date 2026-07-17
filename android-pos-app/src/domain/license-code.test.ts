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

describe("offline activation", () => {
  it("verifies a matching P-256 activation code", async () => { const signed = codeFor(payload); await expect(verifyOfflineActivation(signed.code, payload.deviceId, signed.publicKey)).resolves.toEqual(payload); });
  it("rejects use on a different tablet", async () => { const signed = codeFor(payload); await expect(verifyOfflineActivation(signed.code, "WPOS-OTHER", signed.publicKey)).rejects.toThrow("different tablet"); });
  it("rejects tampering", async () => { const signed = codeFor(payload); await expect(verifyOfflineActivation(`${signed.code}A`, payload.deviceId, signed.publicKey)).rejects.toThrow(); });
  it("parses the QR envelope", () => expect(parseActivationQr(JSON.stringify({ deviceId: "wpos-aaaa-bbbb", activationCode: " code " }))).toEqual({ deviceId: "WPOS-AAAA-BBBB", activationCode: "code" }));
});
