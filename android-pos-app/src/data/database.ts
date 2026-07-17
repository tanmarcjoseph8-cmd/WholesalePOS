import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection, type capSQLiteJson, type capSQLiteSet } from "@capacitor-community/sqlite";
import { currentSchemaVersion, migrations } from "./migrations";
import { createId, nowIso } from "../domain/models";

export type SqlValue = string | number | null;
export type InventoryChangeListener = () => Promise<unknown> | unknown;
export type BatchStatement = { statement: string; values?: SqlValue[] };

export function isInventoryMutationSql(sql: string) {
  const normalized = sql.trim().toLowerCase();
  const mutation = normalized.match(/^(?:insert(?:\s+or\s+\w+)?\s+into|replace(?:\s+into)?|update(?:\s+or\s+\w+)?|delete\s+from)\s+([a-z_][a-z0-9_]*)\b/);
  const table = mutation?.[1];
  return table ? new Set(["inventory_stock", "inventory_reservations", "products", "settings"]).has(table) : false;
}

export class LocalDatabase {
  readonly name = "wholesalepos_offline";
  private manager = new SQLiteConnection(CapacitorSQLite);
  private connection: SQLiteDBConnection | null = null;
  private inventoryListeners = new Set<InventoryChangeListener>();
  private transactionDepth = 0;
  private inventoryChangePending = false;
  private migrationInProgress = false;

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
    this.migrationInProgress = true;
    try {
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
    } finally {
      this.migrationInProgress = false;
    }
  }

  private async seedSystemRows() {
    const now = nowIso();
    await this.transaction(async () => {
      await this.run("INSERT OR IGNORE INTO roles(id, name, permissions_json, created_at) VALUES (?, ?, ?, ?)", ["role_owner", "OWNER", JSON.stringify(["*"]), now], false);
      await this.run("INSERT OR IGNORE INTO roles(id, name, permissions_json, created_at) VALUES (?, ?, ?, ?)", ["role_manager", "MANAGER", JSON.stringify(["sales.manage", "sales.refund", "sales.void", "products.manage", "inventory.manage", "orders.manage", "tables.manage", "reports.view", "settings.manage", "cash_drawer.use", "cash_drawer.manage", "cash_drawer.review", "cash_drawer.report"]), now], false);
      await this.run("INSERT OR IGNORE INTO roles(id, name, permissions_json, created_at) VALUES (?, ?, ?, ?)", ["role_cashier", "CASHIER", JSON.stringify(["sales.manage", "orders.manage", "products.view", "inventory.alerts.view", "cash_drawer.use"]), now], false);
      await this.run("INSERT OR IGNORE INTO warehouses(id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", ["warehouse_main", "MAIN", "Main Warehouse", now, now], false);
      await this.run("INSERT OR IGNORE INTO receipt_sequences(purpose, next_value, prefix) VALUES ('SALE', 1, 'POS')", [], false);
      await this.run("INSERT OR IGNORE INTO receipt_sequences(purpose, next_value, prefix) VALUES ('ORDER', 1, 'ORD')", [], false);
      await this.run("INSERT OR IGNORE INTO receipt_sequences(purpose, next_value, prefix) VALUES ('REFUND', 1, 'REF')", [], false);
      await this.run("INSERT OR IGNORE INTO device_state(key, value, updated_at) VALUES ('installation_id', ?, ?)", [createId("installation"), now], false);
    });
  }

  async execute(sql: string, transaction = true) {
    return this.requireConnection().execute(sql, transaction);
  }

  async run(sql: string, values: SqlValue[] = [], transaction = true) {
    const result = await this.requireConnection().run(sql, values, transaction);
    if (isInventoryMutationSql(sql)) {
      this.inventoryChangePending = true;
      if (this.transactionDepth === 0) await this.flushInventoryChanges();
    }
    return result;
  }

  /** Executes many parameterized statements through one native bridge call. */
  async executeSet(statements: BatchStatement[], transaction = true) {
    if (!statements.length) return null;
    const result = await this.requireConnection().executeSet(statements as capSQLiteSet[], transaction);
    if (statements.some((entry) => isInventoryMutationSql(entry.statement))) {
      this.inventoryChangePending = true;
      if (this.transactionDepth === 0) await this.flushInventoryChanges();
    }
    return result;
  }

  async query<T extends object>(sql: string, values: SqlValue[] = []) {
    const result = await this.requireConnection().query(sql, values);
    return (result.values ?? []) as T[];
  }

  async transaction<T>(operation: () => Promise<T>) {
    const connection = this.requireConnection();
    const pendingBefore = this.inventoryChangePending;
    this.transactionDepth += 1;
    try {
      await connection.beginTransaction();
    } catch (error) {
      this.transactionDepth = Math.max(0, this.transactionDepth - 1);
      throw error;
    }
    try {
      const result = await operation();
      await connection.commitTransaction();
      this.transactionDepth -= 1;
      if (this.transactionDepth === 0) await this.flushInventoryChanges();
      return result;
    } catch (error) {
      if ((await connection.isTransactionActive()).result) await connection.rollbackTransaction();
      this.transactionDepth = Math.max(0, this.transactionDepth - 1);
      this.inventoryChangePending = pendingBefore;
      throw error;
    }
  }

  subscribeInventoryChanges(listener: InventoryChangeListener) {
    this.inventoryListeners.add(listener);
    return () => this.inventoryListeners.delete(listener);
  }

  private async flushInventoryChanges() {
    if (!this.inventoryChangePending) return;
    this.inventoryChangePending = false;
    for (const listener of this.inventoryListeners) {
      try {
        await listener();
      } catch {
        // Inventory commits remain authoritative even if a best-effort alert refresh fails.
      }
    }
  }

  async integrityCheck() {
    const rows = await this.query<{ integrity_check: string }>("PRAGMA integrity_check");
    return rows[0]?.integrity_check === "ok";
  }

  /** Returns lightweight database health and size information without mutating records. */
  async healthSnapshot() {
    const quick = await this.query<{ quick_check: string }>("PRAGMA quick_check");
    const pages = await this.query<{ page_count: number }>("PRAGMA page_count");
    const pageSize = await this.query<{ page_size: number }>("PRAGMA page_size");
    const freePages = await this.query<{ freelist_count: number }>("PRAGMA freelist_count");
    const count = Number(pages[0]?.page_count ?? 0);
    const size = Number(pageSize[0]?.page_size ?? 0);
    return { healthy: quick[0]?.quick_check === "ok", bytes: count * size, pageCount: count, freePageCount: Number(freePages[0]?.freelist_count ?? 0) };
  }

  /** Refreshes SQLite planner statistics only when no migration or transaction is active. */
  async optimize() {
    if (this.migrationInProgress || this.transactionDepth > 0) throw new Error("Database maintenance cannot run during another operation.");
    await this.execute("PRAGMA optimize;", false);
    return this.healthSnapshot();
  }

  async schemaVersion() {
    const rows = await this.query<{ version: number }>("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations");
    return Number(rows[0]?.version ?? 0);
  }

  isMigrationInProgress() {
    return this.migrationInProgress;
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
