import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const { version } = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const candidates = [
  ["android/app/build/outputs/apk/debug/app-debug.apk", `WholesalePOS-Offline-${version}-debug.apk`],
  ["android/app/build/outputs/apk/release/app-release.apk", `WholesalePOS-Offline-${version}-release.apk`],
  ["android/app/build/outputs/bundle/release/app-release.aab", `WholesalePOS-Offline-${version}-release.aab`]
];

const output = resolve("apk");
await mkdir(output, { recursive: true });
const artifacts = [];

for (const [sourceName, targetName] of candidates) {
  const source = resolve(sourceName);
  try {
    await stat(source);
  } catch {
    continue;
  }
  const target = resolve(output, targetName);
  await copyFile(source, target);
  const bytes = await readFile(target);
  artifacts.push({ file: basename(target), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}

if (!artifacts.length) throw new Error("No Android APK or AAB build outputs were found.");
await writeFile(resolve(output, "checksums.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), artifacts }, null, 2)}\n`, "utf8");
for (const artifact of artifacts) console.log(`${artifact.file} ${artifact.bytes} bytes ${artifact.sha256}`);
