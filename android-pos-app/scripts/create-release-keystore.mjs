import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

if (!process.env.JAVA_HOME) throw new Error("JAVA_HOME must point to JDK 21.");
const output = resolve(".toolchain", "signing");
const keystore = join(output, "wholesalepos-release.jks");
const environmentFile = join(output, "release-signing.env");
if (existsSync(keystore) || existsSync(environmentFile)) throw new Error("Release signing material already exists and was not overwritten.");

await mkdir(output, { recursive: true });
const password = randomBytes(24).toString("base64url");
const alias = "wholesalepos-release";
const keytool = join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "keytool.exe" : "keytool");
const result = spawnSync(keytool, [
  "-genkeypair", "-v", "-keystore", keystore, "-storepass", password, "-keypass", password,
  "-alias", alias, "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000",
  "-dname", "CN=WholesalePOS Offline, OU=Android, O=WholesalePOS, L=Manila, C=PH"
], { encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || result.stdout || "keytool failed.");

const normalizedKeystore = keystore.replaceAll("\\", "/");
await writeFile(environmentFile, [
  `WHOLESALEPOS_KEYSTORE_PATH=${normalizedKeystore}`,
  `WHOLESALEPOS_KEYSTORE_PASSWORD=${password}`,
  `WHOLESALEPOS_KEY_ALIAS=${alias}`,
  `WHOLESALEPOS_KEY_PASSWORD=${password}`,
  ""
].join("\n"), { encoding: "utf8", mode: 0o600 });
console.log(`Created release keystore: ${normalizedKeystore}`);
console.log(`Private credentials: ${environmentFile.replaceAll("\\", "/")}`);
