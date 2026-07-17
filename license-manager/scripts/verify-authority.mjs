import { Buffer } from "node:buffer";
import { createHash, createPublicKey, sign, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const appData = process.env.APPDATA;
if (!appData) throw new Error("Windows APPDATA is unavailable.");
const bootstrapPath = join(appData, "WholesalePOS License Manager", "authority.bootstrap.json");
const bootstrap = JSON.parse(await readFile(bootstrapPath, "utf8"));
if (bootstrap.format !== "wholesalepos-license-authority-bootstrap" || bootstrap.protection !== "windows-dpapi-current-user") throw new Error("Authority bootstrap is invalid.");

const command = "Add-Type -AssemblyName System.Security;$value=[Console]::In.ReadToEnd();$protected=[Convert]::FromBase64String($value);$bytes=[System.Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($bytes));[Array]::Clear($bytes,0,$bytes.Length)";
const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { input: bootstrap.encryptedPrivateKey, maxBuffer: 1024 * 1024 });
if (result.status !== 0 || !result.stdout.length) throw new Error("Windows DPAPI could not unlock the signing authority.");
const privateKey = Buffer.from(result.stdout.toString("utf8").trim(), "base64");
try {
  const challenge = Buffer.from(`WholesalePOS authority verification:${new Date().toISOString()}`, "utf8");
  const signature = sign("sha256", challenge, { key: privateKey, dsaEncoding: "ieee-p1363" });
  const publicKey = createPublicKey({ key: bootstrap.publicKeyJwk, format: "jwk" });
  if (!verify("sha256", challenge, { key: publicKey, dsaEncoding: "ieee-p1363" }, signature)) throw new Error("Provisioned private and public keys do not match.");
  const fingerprint = createHash("sha256").update(JSON.stringify(bootstrap.publicKeyJwk)).digest("hex").slice(0, 32).toUpperCase().match(/.{1,4}/g).join("-");
  process.stdout.write(`Authority verified: ${fingerprint}\n`);
} finally {
  privateKey.fill(0);
}
