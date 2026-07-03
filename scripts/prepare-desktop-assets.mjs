import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = path.join(root, "desktop", "app-assets");
const desktopPrismaClient = path.join(root, "desktop", "node_modules", ".prisma", "client");

function findGeneratedPrismaClient() {
  const pnpmStore = path.join(root, "node_modules", ".pnpm");
  const candidates = fs
    .readdirSync(pnpmStore, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"))
    .map((entry) => path.join(pnpmStore, entry.name, "node_modules", ".prisma", "client"))
    .filter((candidate) => fs.existsSync(path.join(candidate, "default.js")));

  if (candidates.length === 0) {
    throw new Error("Missing generated Prisma client. Run `pnpm db:generate` first.");
  }

  candidates.sort();
  return candidates.at(-1);
}

const assets = [
  { from: path.join(root, "backend", "dist"), to: path.join(assetsRoot, "backend", "dist") },
  { from: path.join(root, "backend", "prisma"), to: path.join(assetsRoot, "backend", "prisma") },
  { from: path.join(root, "frontend", "dist"), to: path.join(assetsRoot, "frontend", "dist") }
];

fs.rmSync(assetsRoot, { recursive: true, force: true });

for (const asset of assets) {
  if (!fs.existsSync(asset.from)) {
    throw new Error(`Missing desktop asset source: ${asset.from}`);
  }

  fs.mkdirSync(path.dirname(asset.to), { recursive: true });
  fs.cpSync(asset.from, asset.to, { recursive: true });
}

fs.rmSync(path.dirname(desktopPrismaClient), { recursive: true, force: true });
fs.mkdirSync(path.dirname(desktopPrismaClient), { recursive: true });
fs.cpSync(findGeneratedPrismaClient(), desktopPrismaClient, { recursive: true });
