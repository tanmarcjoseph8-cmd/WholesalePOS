import type { LocalDatabase } from "../data/database";
import { APP_VERSION } from "../domain/app-metadata";
import { FACTORY_RESET_PHRASE } from "../domain/factory-reset-rules";
import { createId, nowIso, type LocalUser } from "../domain/models";
import { fileService, type FileService } from "../platform/file-service";
import type { InventoryNotificationService } from "../platform/inventory-notification-service";
import type { AuthService } from "./auth-service";
import type { BackupService } from "./backup-service";
import { operationCoordinator, type OperationCoordinator } from "./operation-coordinator";

export type FactoryResetCounts = {
  products: number;
  sales: number;
  users: number;
  orders: number;
  cashSessions: number;
};

export type FactoryResetPreview = FactoryResetCounts & {
  hasOpenCashDrawer: boolean;
  unpaidOrders: number;
};

export type FactoryResetProgress =
  | "Creating backup"
  | "Clearing orders"
  | "Clearing sales"
  | "Clearing inventory"
  | "Clearing users"
  | "Clearing settings"
  | "Finishing reset";

export type FactoryResetResult = {
  backup: { fileName: string; uri: string; path: string; bytes: number } | null;
  schemaVersion: number;
  installationId: string;
};

export const factoryResetDeleteGroups: ReadonlyArray<{ progress: FactoryResetProgress; statements: readonly string[] }> = [
  {
    progress: "Clearing sales",
    statements: [
      "DELETE FROM refund_payments",
      "DELETE FROM refund_items",
      "DELETE FROM refunds",
      "DELETE FROM sale_payments",
      "DELETE FROM sale_items",
      "DELETE FROM sales",
      "DELETE FROM cash_movements",
      "DELETE FROM cash_sessions"
    ]
  },
  {
    progress: "Clearing orders",
    statements: [
      "DELETE FROM inventory_reservations",
      "DELETE FROM order_tables",
      "DELETE FROM order_items",
      "UPDATE orders SET merged_into_order_id=NULL, split_from_order_id=NULL",
      "DELETE FROM orders",
      "UPDATE restaurant_tables SET active_order_id=NULL",
      "DELETE FROM restaurant_tables"
    ]
  },
  {
    progress: "Clearing inventory",
    statements: [
      "DELETE FROM inventory_alerts",
      "DELETE FROM inventory_alert_state",
      "DELETE FROM import_batches",
      "DELETE FROM inventory_movements",
      "DELETE FROM inventory_stock",
      "DELETE FROM product_barcodes",
      "DELETE FROM products",
      "UPDATE categories SET parent_id=NULL",
      "DELETE FROM categories"
    ]
  },
  {
    progress: "Clearing settings",
    statements: ["DELETE FROM settings"]
  },
  {
    progress: "Clearing users",
    statements: ["DELETE FROM audit_logs", "DELETE FROM users"]
  }
];

const emptyTables = [
  "products", "categories", "product_barcodes", "inventory_stock", "inventory_movements", "inventory_reservations",
  "orders", "order_items", "order_tables", "restaurant_tables", "sales", "sale_items", "sale_payments", "refunds",
  "refund_items", "refund_payments", "cash_sessions", "cash_movements", "inventory_alerts", "inventory_alert_state",
  "import_batches", "settings", "audit_logs", "users"
] as const;

type ResetBackupService = Pick<BackupService, "createFactoryResetBackup">;
type ResetAuthService = Pick<AuthService, "reauthenticateOwner">;
type ResetNotificationService = Pick<InventoryNotificationService, "clearAll">;

export class FactoryResetService {
  constructor(
    private db: LocalDatabase,
    private auth: ResetAuthService,
    private backups: ResetBackupService,
    private notifications: ResetNotificationService,
    private files: Pick<FileService, "clearGeneratedLocalFiles"> = fileService,
    private operations: OperationCoordinator = operationCoordinator
  ) {}

  private async requireStoredOwner(actor: LocalUser) {
    if (actor.role !== "OWNER") throw new Error("Only the Owner can access Factory Reset.");
    const rows = await this.db.query<{ role_name: string }>(
      `SELECT r.name AS role_name FROM users u JOIN roles r ON r.id=u.role_id
       WHERE u.id=? AND u.status='ACTIVE' AND u.deleted_at IS NULL LIMIT 1`,
      [actor.id]
    );
    if (rows[0]?.role_name !== "OWNER") throw new Error("Only the Owner can access Factory Reset.");
  }

  private async count(table: string, where = "") {
    const rows = await this.db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}${where}`);
    return Number(rows[0]?.count ?? 0);
  }

  async preview(actor: LocalUser): Promise<FactoryResetPreview> {
    await this.requireStoredOwner(actor);
    const [products, sales, users, orders, cashSessions, openCashDrawers, unpaidOrders] = await Promise.all([
      this.count("products"),
      this.count("sales"),
      this.count("users"),
      this.count("orders"),
      this.count("cash_sessions"),
      this.count("cash_sessions", " WHERE status='OPEN'"),
      this.count("orders", " WHERE status NOT IN ('COMPLETED','CANCELLED') AND deleted_at IS NULL")
    ]);
    return { products, sales, users, orders, cashSessions, hasOpenCashDrawer: openCashDrawers > 0, unpaidOrders };
  }

  async reauthenticate(actor: LocalUser, secret: string) {
    await this.requireStoredOwner(actor);
    await this.auth.reauthenticateOwner(actor, secret);
  }

  async execute(
    actor: LocalUser,
    input: { secret: string; confirmationPhrase: string; finalConfirmed: boolean; createBackup: boolean; acknowledgedNoBackup: boolean },
    onProgress: (progress: FactoryResetProgress) => void = () => undefined
  ): Promise<FactoryResetResult> {
    const releaseReset = this.operations.beginReset();
    let databaseDeletionStarted = false;
    try {
      if (this.db.isMigrationInProgress()) throw new Error("Wait for the database update to finish before resetting the app.");
      await this.reauthenticate(actor, input.secret);
      if (input.confirmationPhrase !== FACTORY_RESET_PHRASE) throw new Error(`Type ${FACTORY_RESET_PHRASE} exactly to continue.`);
      if (!input.finalConfirmed) throw new Error("The final factory reset confirmation is required.");
      if (!input.createBackup && !input.acknowledgedNoBackup) throw new Error("Acknowledge that deleted data cannot be recovered without a backup.");

      const schemaVersion = await this.db.schemaVersion();
      let backup: FactoryResetResult["backup"] = null;
      if (input.createBackup) {
        onProgress("Creating backup");
        try {
          backup = await this.backups.createFactoryResetBackup(actor, APP_VERSION);
        } catch {
          throw new Error("Backup creation or verification failed. No business data was erased. Retry the backup before resetting.");
        }
      }

      await this.notifications.clearAll();
      await this.files.clearGeneratedLocalFiles();
      databaseDeletionStarted = true;
      const installationId = createId("installation");
      await this.db.transaction(async () => {
        for (const group of factoryResetDeleteGroups) {
          onProgress(group.progress);
          for (const statement of group.statements) await this.db.run(statement, [], false);
        }
        onProgress("Finishing reset");
        await this.db.run("UPDATE receipt_sequences SET next_value=1", [], false);
        await this.db.run("DELETE FROM device_state", [], false);
        await this.db.run("INSERT INTO device_state(key, value, updated_at) VALUES ('installation_id', ?, ?)", [installationId, nowIso()], false);
        for (const table of emptyTables) {
          if (await this.count(table)) throw new Error("Factory reset verification found remaining business records.");
        }
        if (await this.db.schemaVersion() !== schemaVersion) throw new Error("Database schema version changed during factory reset.");
        const foreignKeyProblems = await this.db.query<object>("PRAGMA foreign_key_check");
        if (foreignKeyProblems.length) throw new Error("Database relationship verification failed during factory reset.");
        if (!(await this.db.integrityCheck())) throw new Error("Database integrity verification failed during factory reset.");
      });
      return { backup, schemaVersion, installationId };
    } catch (error) {
      if (databaseDeletionStarted) {
        console.error("Factory reset failed", { errorType: error instanceof Error ? error.name : "UnknownError" });
        throw new Error("Factory reset could not be completed. No further data was erased. Try again or restore from the backup.");
      }
      throw error;
    } finally {
      releaseReset();
    }
  }
}
