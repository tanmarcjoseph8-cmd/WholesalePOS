import type { capSQLiteJson } from "@capacitor-community/sqlite";
import type { LocalDatabase } from "../data/database";
import { currentSchemaVersion } from "../data/migrations";
import { nowIso, type LocalUser } from "../domain/models";
import { fileService, type FileService } from "../platform/file-service";
import { audit } from "./service-helpers";

type BackupEnvelope = {
  format: "wholesalepos-offline-backup";
  schemaVersion: number;
  createdAt: string;
  payloadHash: string;
  payload: capSQLiteJson;
};

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class BackupService {
  constructor(private db: LocalDatabase, private files: FileService = fileService) {}

  async createBackup(actor: LocalUser) {
    const payload = await this.db.exportFull();
    const payloadText = JSON.stringify(payload);
    const createdAt = nowIso();
    const envelope: BackupEnvelope = { format: "wholesalepos-offline-backup", schemaVersion: currentSchemaVersion, createdAt, payloadHash: await sha256(payloadText), payload };
    const stamp = createdAt.replace(/[:.]/g, "-");
    const uri = await this.files.saveAndShare({ fileName: `wholesalepos-backup-${stamp}.json`, data: JSON.stringify(envelope), mimeType: "application/json", dialogTitle: "Save POS backup" });
    await audit(this.db, { actorId: actor.id, action: "BACKUP_EXPORTED", entityType: "Backup", metadata: { createdAt, uri } });
    return uri;
  }

  async restoreBackup(actor: LocalUser, confirmation: string) {
    if (confirmation !== "RESTORE") throw new Error("Type RESTORE to confirm replacing the current local data.");
    const file = await this.files.pickFile(["application/json"]);
    const envelope = JSON.parse(new TextDecoder().decode(file.bytes)) as BackupEnvelope;
    if (envelope.format !== "wholesalepos-offline-backup" || !envelope.payload) throw new Error("This is not a WholesalePOS Android backup.");
    if (envelope.schemaVersion > currentSchemaVersion) throw new Error("This backup was created by a newer app version.");
    if (await sha256(JSON.stringify(envelope.payload)) !== envelope.payloadHash) throw new Error("Backup integrity validation failed.");
    if (!(await this.db.validateImport(envelope.payload))) throw new Error("Backup database validation failed.");
    const safetyPayload = await this.db.exportFull();
    const safetyCreatedAt = nowIso();
    const safetyEnvelope: BackupEnvelope = { format: "wholesalepos-offline-backup", schemaVersion: currentSchemaVersion, createdAt: safetyCreatedAt, payloadHash: await sha256(JSON.stringify(safetyPayload)), payload: safetyPayload };
    await this.files.saveAndShare({ fileName: `pre-restore-${safetyCreatedAt.replace(/:/g, "-")}.json`, data: JSON.stringify(safetyEnvelope), mimeType: "application/json", dialogTitle: "Save safety backup before restore" });
    await this.db.replaceFromExport(envelope.payload);
    await audit(this.db, { actorId: actor.id, action: "BACKUP_RESTORED", entityType: "Backup", reason: `Restored ${file.name}`, metadata: { backupCreatedAt: envelope.createdAt } });
  }
}
