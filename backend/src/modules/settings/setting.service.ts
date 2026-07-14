import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";
import type { Actor } from "../auth/actor.js";
import type { SettingsUpdateInput } from "./setting.schemas.js";

const defaults = {
  businessMode: { mode: "RETAIL" },
  business: { name: "WholesalePOS Store", phone: "", email: "", address: "" },
  tax: { vatRate: 0, pricesIncludeVat: false },
  receipt: { footer: "Thank you", paperWidth: "80mm" },
  printer: { printerName: "Windows default printer", printerType: "WINDOWS" },
  theme: { mode: "system" },
  backup: { automaticBackupsEnabled: true, retentionDays: 30 },
  inventoryImport: { batchSize: 250, preventDuplicateFiles: true, defaultMode: "ADD_AND_UPDATE" },
  restaurant: {
    enableTables: true,
    allowWalkInOrders: true,
    enableDelivery: false,
    enableTakeout: true,
    enableKitchenTickets: false,
    serviceChargeRate: 0,
    splitBilling: false,
    partialPayments: false,
    orderNumberFormat: "{TYPE}-{NUMBER}"
  }
};

function databasePath() {
  if (!env.DATABASE_URL.startsWith("file:")) {
    throw new AppError(400, "BACKUP_UNSUPPORTED", "Backups are only available for local SQLite databases.");
  }
  const rawPath = env.DATABASE_URL.slice("file:".length);
  return path.resolve(rawPath.startsWith("/") ? fileURLToPath(env.DATABASE_URL) : rawPath);
}

function backupDirectory() {
  return path.join(path.dirname(databasePath()), "backups");
}

function mergeSettings(saved: Record<string, unknown>) {
  return {
    businessMode: { ...defaults.businessMode, ...(saved.businessMode as object | undefined) },
    business: { ...defaults.business, ...(saved.business as object | undefined) },
    tax: { ...defaults.tax, ...(saved.tax as object | undefined) },
    receipt: { ...defaults.receipt, ...(saved.receipt as object | undefined) },
    printer: { ...defaults.printer, ...(saved.printer as object | undefined) },
    theme: { ...defaults.theme, ...(saved.theme as object | undefined) },
    backup: { ...defaults.backup, ...(saved.backup as object | undefined) },
    inventoryImport: { ...defaults.inventoryImport, ...(saved.inventoryImport as object | undefined) },
    restaurant: { ...defaults.restaurant, ...(saved.restaurant as object | undefined) }
  };
}

function requireStoreId(actor: Actor) {
  if (!actor.storeId) {
    throw new AppError(400, "STORE_REQUIRED", "Settings require a store.");
  }
  return actor.storeId;
}

function serializeBackupRun<T extends { fileSizeBytes: bigint | number | null }>(backup: T) {
  return { ...backup, fileSizeBytes: backup.fileSizeBytes === null ? null : Number(backup.fileSizeBytes) };
}

export async function getSettings(actor: Actor) {
  const storeId = requireStoreId(actor);
  const rows = await prisma.setting.findMany({ where: { storeId } });
  const saved = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return mergeSettings(saved);
}

export async function getRuntimeSettings(actor: Actor) {
  const settings = await getSettings(actor);
  return { businessMode: settings.businessMode, restaurant: settings.restaurant };
}

export async function updateSettings(actor: Actor, input: SettingsUpdateInput) {
  const storeId = requireStoreId(actor);
  const entries = Object.entries(input);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { storeId_key: { storeId, key } },
        update: { value },
        create: { storeId, key, value, scope: "STORE", valueType: "json" }
      })
    )
  );

  await prisma.auditLog.create({
    data: {
      actorId: actor.userId,
      action: "SETTINGS_UPDATED",
      entityType: "Setting",
      metadata: { keys: entries.map(([key]) => key) }
    }
  });

  return getSettings(actor);
}

export async function createManualBackup(actor: Actor) {
  const source = databasePath();
  const directory = backupDirectory();
  await fs.mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const target = path.join(directory, `wholesalepos-${stamp}.sqlite`);
  const run = await prisma.backupRun.create({
    data: { createdByUserId: actor.userId, type: "MANUAL", status: "RUNNING", filePath: target }
  });

  try {
    await fs.copyFile(source, target);
    const stats = await fs.stat(target);
    const completed = await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", fileSizeBytes: BigInt(stats.size), completedAt: new Date() }
    });
    return serializeBackupRun(completed);
  } catch (error) {
    await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Backup failed.", completedAt: new Date() }
    });
    throw error;
  }
}

export async function listBackups() {
  const backups = await prisma.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
  return backups.map(serializeBackupRun);
}

export async function restoreBackup(actor: Actor, backupRunId: string) {
  const backup = await prisma.backupRun.findUnique({ where: { id: backupRunId } });
  if (!backup?.filePath || backup.status !== "COMPLETED") {
    throw new AppError(404, "BACKUP_NOT_FOUND", "The completed backup was not found.");
  }

  const directory = path.resolve(backupDirectory());
  const selected = path.resolve(backup.filePath);
  if (!selected.startsWith(directory)) {
    throw new AppError(400, "BACKUP_OUTSIDE_DIRECTORY", "The selected backup is outside the managed backup folder.");
  }

  const current = databasePath();
  const restoreSafetyCopy = path.join(directory, `pre-restore-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.sqlite`);
  await fs.copyFile(current, restoreSafetyCopy);
  await fs.copyFile(selected, current);
  await prisma.auditLog.create({
    data: {
      actorId: actor.userId,
      action: "BACKUP_RESTORED",
      entityType: "BackupRun",
      entityId: backup.id,
      metadata: { restoredFrom: selected, safetyCopy: restoreSafetyCopy }
    }
  });

  return { restored: true, requiresRestart: true, safetyCopy: restoreSafetyCopy };
}
