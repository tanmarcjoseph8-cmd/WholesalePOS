import { describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../data/database";
import type { LocalUser } from "../domain/models";
import type { FileService } from "../platform/file-service";
import { BackupService } from "./backup-service";

const owner: LocalUser = { id: "owner-1", name: "Owner", login: "owner", role: "OWNER", permissions: ["*"] };

describe("factory reset backup", () => {
  it("writes a timestamped, integrity-protected backup to persistent external storage", async () => {
    const run = vi.fn(async () => ({ changes: { changes: 1 } }));
    const db = { run, exportFull: vi.fn(async () => ({ export: { database: "wholesalepos_offline", version: 6, tables: [] } })) } as unknown as LocalDatabase;
    let written: { fileName: string; data: string } | null = null;
    const files = {
      writePersistentBackup: vi.fn(async (input: { fileName: string; data: string }) => {
        written = input;
        return { uri: `file:///external/${input.fileName}`, path: `WholesalePOS Backups/${input.fileName}`, bytes: input.data.length };
      })
    } as unknown as FileService;

    const result = await new BackupService(db, files).createFactoryResetBackup(owner, "0.5.0");
    expect(result.fileName).toMatch(/^before-factory-reset-.*\.json$/);
    expect(result.path).toContain("WholesalePOS Backups/");
    expect(result.bytes).toBeGreaterThan(0);
    expect(written).not.toBeNull();
    const envelope = JSON.parse((written as unknown as { data: string }).data) as { format: string; payloadHash: string; resetMetadata: Record<string, string> };
    expect(envelope.format).toBe("wholesalepos-offline-backup");
    expect(envelope.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.resetMetadata).toMatchObject({ ownerUserId: owner.id, appVersion: "0.5.0", resetType: "FACTORY_RESET", resetResult: "PENDING" });
    expect(JSON.stringify(envelope)).not.toContain("2468");
  });
});
