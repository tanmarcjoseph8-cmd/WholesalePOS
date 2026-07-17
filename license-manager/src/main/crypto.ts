import { createCipheriv, createDecipheriv, createHash, createPublicKey, generateKeyPairSync, randomBytes, scryptSync, sign, verify, type JsonWebKey as NodeJsonWebKey } from "node:crypto";
import type { ActivationPayload, LicenseVaultData } from "../shared/contracts.js";

export type EncryptedVaultEnvelope = {
  format: "wholesalepos-license-vault";
  version: 1;
  kdf: { name: "scrypt"; salt: string; cost: number; blockSize: number; parallelization: number };
  cipher: { name: "aes-256-gcm"; iv: string; tag: string };
  ciphertext: string;
};

const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

/** Creates a P-256 signing authority suitable for offline activation codes. */
export function generateSigningAuthority() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyJwk: publicKey.export({ format: "jwk" }) as JsonWebKey
  };
}

/** Serializes activation claims in the single canonical field order used by all platforms. */
export function canonicalActivationPayload(payload: ActivationPayload) {
  if (payload.version === 2) {
    return JSON.stringify({
      format: payload.format,
      version: payload.version,
      licenseId: payload.licenseId,
      licenseSerialNumber: payload.licenseSerialNumber,
      customerId: payload.customerId,
      deviceId: payload.deviceId,
      productId: payload.productId,
      productName: payload.productName,
      productVersion: payload.productVersion,
      edition: payload.edition,
      licenseType: payload.licenseType,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt
    });
  }
  return JSON.stringify({
    format: payload.format,
    version: payload.version,
    licenseId: payload.licenseId,
    deviceId: payload.deviceId,
    productId: payload.productId,
    productName: payload.productName,
    productVersion: payload.productVersion,
    edition: payload.edition,
    issuedAt: payload.issuedAt
  });
}

/** Signs activation claims without exposing the private key outside the main process. */
export function createActivationCode(privateKeyPem: string, payload: ActivationPayload) {
  const payloadBytes = Buffer.from(canonicalActivationPayload(payload), "utf8");
  const signature = sign("sha256", payloadBytes, { key: privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `WPOS1.${payloadBytes.toString("base64url")}.${signature.toString("base64url")}`;
}

/** Parses and verifies an activation code against the authority public key. */
export function verifyActivationCode(code: string, publicKeyJwk: JsonWebKey) {
  const [prefix, payloadPart, signaturePart, extra] = code.trim().split(".");
  if (prefix !== "WPOS1" || !payloadPart || !signaturePart || extra) throw new Error("Activation code format is invalid.");
  const payloadBytes = Buffer.from(payloadPart, "base64url");
  const signature = Buffer.from(signaturePart, "base64url");
  if (signature.length !== 64) throw new Error("Activation signature is invalid.");
  const publicKey = createPublicKey({ key: publicKeyJwk as NodeJsonWebKey, format: "jwk" });
  if (!verify("sha256", payloadBytes, { key: publicKey, dsaEncoding: "ieee-p1363" }, signature)) throw new Error("Activation signature is invalid.");
  const payload = JSON.parse(payloadBytes.toString("utf8")) as ActivationPayload;
  if (canonicalActivationPayload(payload) !== payloadBytes.toString("utf8") || payload.format !== "WPOS-LICENSE" || ![1, 2].includes(payload.version)) throw new Error("Activation payload is invalid.");
  if (payload.version === 2 && (!payload.licenseSerialNumber || !payload.customerId || !["MONTHLY", "YEARLY", "LIFETIME"].includes(payload.licenseType) || (payload.licenseType === "LIFETIME" ? payload.expiresAt !== null : !payload.expiresAt))) throw new Error("Activation payload is invalid.");
  return payload;
}

/** Returns a short non-secret fingerprint used to confirm the configured authority. */
export function publicKeyFingerprint(publicKeyJwk: JsonWebKey) {
  return createHash("sha256").update(JSON.stringify(publicKeyJwk)).digest("hex").match(/.{1,4}/g)?.slice(0, 8).join("-").toUpperCase() ?? "";
}

/** Derives a vault encryption key from the administrator password and supplied salt. */
export function deriveVaultKey(password: string, salt: Buffer) {
  if (password.length < 12) throw new Error("Administrator password must contain at least 12 characters.");
  return scryptSync(password, salt, 32, { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION, maxmem: MAX_MEMORY });
}

/** Encrypts the complete private database using AES-256-GCM and scrypt. */
export function encryptVault(data: LicenseVaultData, password: string) {
  const salt = randomBytes(16);
  const key = deriveVaultKey(password, salt);
  try {
    return encryptVaultWithKey(data, key, salt);
  } finally {
    key.fill(0);
  }
}

/** Encrypts the vault using an already-derived in-memory key. */
export function encryptVaultWithKey(data: LicenseVaultData, key: Buffer, salt: Buffer): EncryptedVaultEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("WholesalePOS License Manager vault v1", "utf8"));
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  try {
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      format: "wholesalepos-license-vault",
      version: 1,
      kdf: { name: "scrypt", salt: salt.toString("base64"), cost: SCRYPT_COST, blockSize: SCRYPT_BLOCK_SIZE, parallelization: SCRYPT_PARALLELIZATION },
      cipher: { name: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") },
      ciphertext: ciphertext.toString("base64")
    };
  } finally {
    plaintext.fill(0);
  }
}

/** Decrypts and validates an encrypted vault while returning the derived key for the unlocked session. */
export function decryptVault(envelope: EncryptedVaultEnvelope, password: string) {
  if (envelope.format !== "wholesalepos-license-vault" || envelope.version !== 1 || envelope.kdf.name !== "scrypt" || envelope.cipher.name !== "aes-256-gcm") throw new Error("This is not a supported License Manager vault.");
  const salt = Buffer.from(envelope.kdf.salt, "base64");
  const key = deriveVaultKey(password, salt);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.cipher.iv, "base64"));
    decipher.setAAD(Buffer.from("WholesalePOS License Manager vault v1", "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.cipher.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
    try {
      const data = JSON.parse(plaintext.toString("utf8")) as LicenseVaultData;
      validateVaultData(data);
      return { data, key: Buffer.from(key), salt };
    } finally {
      plaintext.fill(0);
    }
  } catch {
    throw new Error("The administrator password is incorrect or the vault is damaged.");
  } finally {
    key.fill(0);
  }
}

/** Rejects malformed or incomplete decrypted database content before it enters the application. */
export function validateVaultData(data: LicenseVaultData) {
  if (data.schemaVersion !== 1 || !data.authorityId || !data.privateKeyPem || !data.publicKeyJwk || !Array.isArray(data.customers) || !Array.isArray(data.licenses) || !Array.isArray(data.activationEvents) || !Array.isArray(data.products)) throw new Error("The decrypted license database is invalid.");
}
