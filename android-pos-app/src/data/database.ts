import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection, type capSQLiteJson } from "@capacitor-community/sqlite";
import { currentSchemaVersion, migrations } from "./migrations";
import { nowIso } from "../domain/models";

export type SqlValue = string | number | null;

export class LocalDatabase {
  readonly name = "wholesalepos_offline";
  private manager = new SQLiteConnection(CapacitorSQLite);
  private connection: SQLiteDBConnection | null = null;

  async initialize() {
    if (!Capacitor.isNativePlatform()) {
      throw new Error("The production database is available inside the Android application. Use an Android emulator or tablet for persistent data.");
    }

    const consistency = await this.manager.checkConnectionsConsistency();
    if (!consistency.result) await this.manager.closeAllConnections();
    const existing = await this.manager.isConnection(this.name, false);
    this.connection = existing.result
      ? await this.manager.retrieveConnection(this.name, false)
      : await this.manager.createConnection(this.name, false, "no-encryption", currentSchemaVersion, false);
    if (!(await this.connection.isDBOpen()).result) await this.connection.open();
    await this.connection.execute("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;", false);
    await this.applyMigrations();
    await this.seedSystemRows();
  }

  private requireConnection() {
    if (!this.connection) throw new Error("Local database has not been initialized.");
    return this.connection;
  }

  private async applyMigrations() {
    const connection = this.requireConnection();
    await connection.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );`, true);
    const rows = await this.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version");
    const applied = new Set(rows.map((row) => Number(row.version)));
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      await this.transaction(async () => {
        await this.execute(migration.sql, false);
        await this.run("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)", [migration.version, migration.name, nowIso()], false);
      });
    }
  }

  private async seedSystemRows() {
    const now = nowIso();
    await this.transaction(async () => {
      await this.run("INSERT OR IGNORE INTO roles(id, name, permissions_json, created_at) VALUES (?, ?, ?, ?)", ["role_owner", "OWNER", JSON.stringify(["*"]), now], false);
      await this.run("INSERT OR IGNORE INTO roles(id, name, permissions_json, created_at) VALUES (?, ?, ?, ?)", ["role_manager", "MANAGER", JSON.stringify(["sales.manage", "sales.refund", "sales.void", "products.manage", "inventory.manage", "orders.manage", "tables.manage", "reports.view", "settings.manage"]), now], false);
      await this.run("INSERT OR IGNORE INTO roles(id, name, permissions_json, created_at) VALUES (?, ?, ?, ?)", ["role_cashier", "CASHIER", JSON.stringify(["sales.manage", "orders.manage", "products.view", "inventory.view"]), now], false);
      await this.run("INSERT OR IGNORE INTO warehouses(id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", ["warehouse_main", "MAIN", "Main Warehouse", now, now], false);
      await this.run("INSERT OR IGNORE INTO receipt_sequences(purpose, next_value, prefix) VALUES ('SALE', 1, 'POS')", [], false);
      await this.run("INSERT OR IGNORE INTO receipt_sequences(purpose, next_value, prefix) VALUES ('ORDER', 1, 'ORD')", [], false);
      await this.run("INSERT OR IGNORE INTO receipt_sequences(purpose, next_value, prefix) VALUES ('REFUND', 1, 'REF')", [], false);
    });
  }

  async execute(sql: string, transaction = true) {
    return this.requireConnection().execute(sql, transaction);
  }

  async run(sql: string, values: SqlValue[] = [], transaction = true) {
    return this.requireConnection().run(sql, values, transaction);
  }

  async query<T extends object>(sql: string, values: SqlValue[] = []) {
    const result = await this.requireConnection().query(sql, values);
    return (result.values ?? []) as T[];
  }

  async transaction<T>(operation: () => Promise<T>) {
    const connection = this.requireConnection();
    await connection.beginTransaction();
    try {
      const result = await operation();
      await connection.commitTransaction();
      return result;
    } catch (error) {
      if ((await connection.isTransactionActive()).result) await connection.rollbackTransaction();
      throw error;
    }
  }

  async integrityCheck() {
    const rows = await this.query<{ integrity_check: string }>("PRAGMA integrity_check");
    return rows[0]?.integrity_check === "ok";
  }

  async schemaVersion() {
    const rows = await this.query<{ version: number }>("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations");
    return Number(rows[0]?.version ?? 0);
  }

  async exportFull() {
    return this.requireConnection().exportToJson("full", false);
  }

  async validateImport(payload: capSQLiteJson) {
    const exported = payload.export;
    if (!exported || exported.database !== this.name || Number(exported.version) > currentSchemaVersion) return false;
    return (await this.manager.isJsonValid(JSON.stringify(exported))).result === true;
  }

  async replaceFromExport(payload: capSQLiteJson) {
    if (!(await this.validateImport(payload))) throw new Error("The selected backup is invalid or was created by a newer app version.");
    await this.close();
    await this.manager.importFromJson(JSON.stringify({ ...payload.export, overwrite: true }));
    await this.initialize();
    if (!(await this.integrityCheck())) throw new Error("The restored database did not pass its integrity check.");
  }

  async close() {
    if (!this.connection) return;
    if ((await this.connection.isDBOpen()).result) await this.connection.close();
    await this.manager.closeConnection(this.name, false);
    this.connection = null;
  }
}

export const database = new LocalDatabase();
