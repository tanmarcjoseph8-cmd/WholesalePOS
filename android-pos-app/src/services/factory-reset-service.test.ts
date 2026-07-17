import { describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../data/database";
import type { LocalUser } from "../domain/models";
import { AuthService } from "./auth-service";
import { FactoryResetService, factoryResetDeleteGroups } from "./factory-reset-service";
import { OperationCoordinator } from "./operation-coordinator";

const owner: LocalUser = { id: "owner-1", name: "Owner", login: "owner", role: "OWNER", permissions: ["*"] };
const manager: LocalUser = { id: "manager-1", name: "Manager", login: "manager", role: "MANAGER", permissions: ["settings.manage"] };
const cashier: LocalUser = { id: "cashier-1", name: "Cashier", login: "cashier", role: "CASHIER", permissions: ["sales.manage"] };
const validInput = { secret: "2468", confirmationPhrase: "FACTORY RESET", finalConfirmed: true, createBackup: false, acknowledgedNoBackup: true };

class ResetDatabaseFake {
  runs: string[] = [];
  role = "OWNER";
  migration = false;
  failOn = "";
  counts: Record<string, number> = { products: 12, sales: 8, users: 3, orders: 4, cash_sessions: 2 };

  async query<T extends object>(sql: string): Promise<T[]> {
    const normalized = sql.toLowerCase();
    if (normalized.includes("join roles") && normalized.includes("role_name")) return [{ role_name: this.role }] as T[];
    if (normalized.startsWith("pragma foreign_key_check")) return [];
    if (normalized.includes("count(*)")) {
      const table = normalized.match(/from\s+([a-z_]+)/)?.[1] ?? "";
      if (table === "cash_sessions" && normalized.includes("status='open'")) return [{ count: 1 }] as T[];
      if (table === "orders" && normalized.includes("status not in")) return [{ count: 2 }] as T[];
      return [{ count: this.counts[table] ?? 0 }] as T[];
    }
    return [];
  }

  async run(sql: string) {
    if (this.failOn && sql.includes(this.failOn)) throw new Error("forced database failure");
    this.runs.push(sql);
    const deleted = sql.match(/^DELETE FROM ([a-z_]+)/)?.[1];
    if (deleted) this.counts[deleted] = 0;
    return { changes: { changes: 1 } };
  }

  async transaction<T>(operation: () => Promise<T>) { return operation(); }
  async schemaVersion() { return 6; }
  async integrityCheck() { return true; }
  isMigrationInProgress() { return this.migration; }
}

function harness(input: { db?: ResetDatabaseFake; auth?: { reauthenticateOwner: (actor: LocalUser, secret: string) => Promise<void> }; operations?: OperationCoordinator; backupFailure?: boolean } = {}) {
  const db = input.db ?? new ResetDatabaseFake();
  const auth = input.auth ?? { reauthenticateOwner: vi.fn(async () => undefined) };
  const backup = { createFactoryResetBackup: vi.fn(async () => {
    if (input.backupFailure) throw new Error("backup failed");
    return { fileName: "backup.json", createdAt: "2026-07-17T00:00:00.000Z", uri: "file://backup.json", path: "backups/backup.json", bytes: 100 };
  }) };
  const notifications = { clearAll: vi.fn(async () => undefined) };
  const files = { clearGeneratedLocalFiles: vi.fn(async () => undefined) };
  const operations = input.operations ?? new OperationCoordinator();
  const service = new FactoryResetService(db as unknown as LocalDatabase, auth, backup, notifications, files, operations);
  return { service, db, auth, backup, notifications, files, operations };
}

describe("FactoryResetService", () => {
  it("returns final deletion counts and unfinished-business warnings to the Owner", async () => {
    await expect(harness().service.preview(owner)).resolves.toEqual({ products: 12, sales: 8, users: 3, orders: 4, cashSessions: 2, hasOpenCashDrawer: true, unpaidOrders: 2 });
  });

  it("rejects a direct manager service call", async () => await expect(harness().service.preview(manager)).rejects.toThrow("Only the Owner"));
  it("rejects a direct cashier service call", async () => await expect(harness().service.preview(cashier)).rejects.toThrow("Only the Owner"));

  it("checks the stored role instead of trusting the UI user object", async () => {
    const setup = harness(); setup.db.role = "MANAGER";
    await expect(setup.service.preview(owner)).rejects.toThrow("Only the Owner");
  });

  it("blocks reset when Owner reauthentication fails", async () => {
    const auth = { reauthenticateOwner: vi.fn(async () => { throw new Error("The Owner PIN or password is incorrect."); }) };
    const setup = harness({ auth });
    await expect(setup.service.execute(owner, validInput)).rejects.toThrow("incorrect");
    expect(setup.db.runs).toHaveLength(0);
  });

  it("blocks an incorrect typed phrase", async () => {
    const setup = harness();
    await expect(setup.service.execute(owner, { ...validInput, confirmationPhrase: "factory reset" })).rejects.toThrow("Type FACTORY RESET exactly");
    expect(setup.db.runs).toHaveLength(0);
  });

  it("requires the final destructive confirmation", async () => {
    await expect(harness().service.execute(owner, { ...validInput, finalConfirmed: false })).rejects.toThrow("final factory reset confirmation");
  });

  it("requires explicit recovery acknowledgment when backup is disabled", async () => {
    await expect(harness().service.execute(owner, { ...validInput, acknowledgedNoBackup: false })).rejects.toThrow("Acknowledge");
  });

  it("creates a verified backup before any deletion", async () => {
    const setup = harness();
    const result = await setup.service.execute(owner, { ...validInput, createBackup: true, acknowledgedNoBackup: false });
    expect(setup.backup.createFactoryResetBackup).toHaveBeenCalledOnce();
    expect(result.backup?.bytes).toBe(100);
    expect(setup.db.runs[0]).toBe("DELETE FROM refund_payments");
  });

  it("stops without deletion when backup creation fails", async () => {
    const setup = harness({ backupFailure: true });
    await expect(setup.service.execute(owner, { ...validInput, createBackup: true })).rejects.toThrow("No business data was erased");
    expect(setup.db.runs).toHaveLength(0);
  });

  it("deletes products, categories, and barcodes", () => {
    const sql = factoryResetDeleteGroups.flatMap((group) => group.statements).join(";");
    for (const table of ["products", "categories", "product_barcodes"]) expect(sql).toContain(`DELETE FROM ${table}`);
  });

  it("deletes inventory, movement, reservation, import, and alert data", () => {
    const sql = factoryResetDeleteGroups.flatMap((group) => group.statements).join(";");
    for (const table of ["inventory_stock", "inventory_movements", "inventory_reservations", "import_batches", "inventory_alerts", "inventory_alert_state"]) expect(sql).toContain(`DELETE FROM ${table}`);
  });

  it("deletes sales, payments, refund, and receipt source data", () => {
    const sql = factoryResetDeleteGroups.flatMap((group) => group.statements).join(";");
    for (const table of ["sales", "sale_items", "sale_payments", "refunds", "refund_items", "refund_payments"]) expect(sql).toContain(`DELETE FROM ${table}`);
  });

  it("deletes every restaurant order and table data family", () => {
    const sql = factoryResetDeleteGroups.flatMap((group) => group.statements).join(";");
    for (const table of ["orders", "order_items", "order_tables", "restaurant_tables"]) expect(sql).toContain(`DELETE FROM ${table}`);
  });

  it("deletes cash sessions and their complete movement history", () => {
    const sql = factoryResetDeleteGroups.flatMap((group) => group.statements).join(";");
    expect(sql).toContain("DELETE FROM cash_movements"); expect(sql).toContain("DELETE FROM cash_sessions");
  });

  it("deletes users, settings, and audit history", () => {
    const sql = factoryResetDeleteGroups.flatMap((group) => group.statements).join(";");
    for (const table of ["users", "settings", "audit_logs"]) expect(sql).toContain(`DELETE FROM ${table}`);
  });

  it("preserves schema, migrations, roles, and warehouse definitions", () => {
    const sql = factoryResetDeleteGroups.flatMap((group) => group.statements).join(";").toLowerCase();
    expect(sql).not.toMatch(/\b(drop|alter|create)\b/);
    expect(sql).not.toContain("delete from schema_migrations");
    expect(sql).not.toContain("delete from roles");
    expect(sql).not.toContain("delete from warehouses");
    expect(sql).not.toContain("delete from license_state");
  });

  it("resets receipt numbers and generates a new Installation ID", async () => {
    const setup = harness();
    const result = await setup.service.execute(owner, validInput);
    expect(setup.db.runs).toContain("UPDATE receipt_sequences SET next_value=1");
    expect(setup.db.runs).toContain("DELETE FROM device_state");
    expect(result.installationId).toMatch(/^installation_/);
  });

  it("clears generated files and Android notification history", async () => {
    const setup = harness(); await setup.service.execute(owner, validInput);
    expect(setup.files.clearGeneratedLocalFiles).toHaveBeenCalledOnce();
    expect(setup.notifications.clearAll).toHaveBeenCalledOnce();
  });

  it("cannot run twice simultaneously", async () => {
    let releaseAuthentication: () => void = () => undefined;
    const auth = { reauthenticateOwner: vi.fn(() => new Promise<void>((resolve) => { releaseAuthentication = resolve; })) };
    const setup = harness({ auth });
    const first = setup.service.execute(owner, validInput);
    await Promise.resolve();
    await expect(setup.service.execute(owner, validInput)).rejects.toThrow("already in progress");
    releaseAuthentication();
    await first;
  });

  it("blocks reset while a payment is active", async () => {
    const operations = new OperationCoordinator(); const release = operations.beginPayment();
    await expect(harness({ operations }).service.execute(owner, validInput)).rejects.toThrow("active payment");
    release();
  });

  it("blocks reset while a database migration is active", async () => {
    const setup = harness(); setup.db.migration = true;
    await expect(setup.service.execute(owner, validInput)).rejects.toThrow("database update");
  });

  it("does not falsely report success when transactional deletion fails", async () => {
    const setup = harness(); setup.db.failOn = "DELETE FROM products";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(setup.service.execute(owner, validInput)).rejects.toThrow("could not be completed");
    consoleError.mockRestore();
  });

  it("leaves AuthService in fresh Owner-setup mode after users are erased", async () => {
    const setup = harness(); await setup.service.execute(owner, validInput);
    const auth = new AuthService(setup.db as unknown as LocalDatabase);
    await expect(auth.requiresSetup()).resolves.toBe(true);
  });
});
