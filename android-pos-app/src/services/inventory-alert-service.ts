import type { LocalDatabase } from "../data/database";
import { effectiveStockThreshold, stockAlertStatus } from "../domain/inventory-alerts";
import { nowIso, type InventoryAlertRecord, type InventoryStatusRecord, type LocalUser, type UnitCode } from "../domain/models";
import type { InventoryNotificationService } from "../platform/inventory-notification-service";
import type { SettingsReportService } from "./settings-report-service";

type InventorySnapshotRow = {
  product_id: string;
  product_name: string;
  inventory_unit: UnitCode;
  warehouse_id: string;
  warehouse_name: string;
  available_micro: number;
  minimum_stock_micro: number;
};

const inventoryCandidatesSql = `WITH stock AS (
  SELECT p.id AS product_id, w.id AS warehouse_id, COALESCE(ai.available_micro,0) AS quantity_micro,
    CASE WHEN p.minimum_stock_micro>0 THEN p.minimum_stock_micro ELSE ? END AS threshold_micro
  FROM products p CROSS JOIN warehouses w
  LEFT JOIN available_inventory ai ON ai.product_id=p.id AND ai.warehouse_id=w.id
  WHERE p.status='ACTIVE' AND p.deleted_at IS NULL AND w.deleted_at IS NULL
), candidates AS (
  SELECT stock.*, state.current_status AS previous_status,
    CASE WHEN quantity_micro<=0 THEN 'OUT_OF_STOCK'
      WHEN quantity_micro<=threshold_micro THEN 'LOW_STOCK' ELSE 'NORMAL' END AS next_status
  FROM stock LEFT JOIN inventory_alert_state state
    ON state.product_id=stock.product_id AND state.warehouse_id=stock.warehouse_id
)`;

const createsAlertSql = `next_status<>'NORMAL' AND (
  previous_status IS NULL OR previous_status='NORMAL'
  OR (previous_status='LOW_STOCK' AND next_status='OUT_OF_STOCK')
)`;

function requireInventoryPermission(actor: LocalUser) {
  if (!actor.permissions.includes("*") && !actor.permissions.includes("inventory.view") && !actor.permissions.includes("inventory.manage")) {
    throw new Error("Inventory permission is required.");
  }
}

export class InventoryAlertService {
  private reconciliation: Promise<InventoryAlertRecord[]> = Promise.resolve([]);

  constructor(
    private db: LocalDatabase,
    private settings: SettingsReportService,
    private notifications: InventoryNotificationService
  ) {}

  async initialize() {
    this.db.subscribeInventoryChanges(() => this.reconcileAndNotify());
    await this.reconcileAndNotify();
  }

  reconcileAndNotify() {
    this.reconciliation = this.reconciliation.then(() => this.reconcile()).catch(() => []);
    return this.reconciliation;
  }

  private async snapshots() {
    return this.db.query<InventorySnapshotRow>(
      `SELECT p.id AS product_id, p.name AS product_name, p.inventory_unit, w.id AS warehouse_id, w.name AS warehouse_name,
        COALESCE(ai.available_micro,0) AS available_micro, p.minimum_stock_micro
       FROM products p CROSS JOIN warehouses w
       LEFT JOIN available_inventory ai ON ai.product_id=p.id AND ai.warehouse_id=w.id
       WHERE p.status='ACTIVE' AND p.deleted_at IS NULL AND w.deleted_at IS NULL
       ORDER BY p.name, w.name`
    );
  }

  private mapAlert(row: {
    id: string; product_id: string; product_name: string; warehouse_id: string; warehouse_name: string; inventory_unit: UnitCode;
    alert_type: "LOW_STOCK" | "OUT_OF_STOCK"; quantity_micro: number; threshold_micro: number; is_read: number;
    resolved_at: string | null; created_at: string;
  }): InventoryAlertRecord {
    return {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name,
      inventoryUnit: row.inventory_unit,
      alertType: row.alert_type,
      currentQuantityMicro: Number(row.quantity_micro),
      thresholdMicro: Number(row.threshold_micro),
      isRead: Number(row.is_read) === 1,
      isResolved: Boolean(row.resolved_at),
      createdAt: row.created_at
    };
  }

  private async reconcile() {
    const settings = await this.settings.getSettings();
    const now = nowIso();
    await this.db.transaction(async () => {
      await this.db.run(
        `${inventoryCandidatesSql}
         INSERT INTO inventory_alerts(id, event_key, product_id, warehouse_id, alert_type, quantity_micro, threshold_micro, created_at)
         SELECT 'stockalert_' || lower(hex(randomblob(16))), 'stockevent_' || lower(hex(randomblob(16))),
           product_id, warehouse_id, next_status, quantity_micro, threshold_micro, ?
         FROM candidates WHERE ${createsAlertSql}`,
        [settings.defaultLowStockThresholdMicro, now],
        false
      );
      await this.db.run(
        `${inventoryCandidatesSql}
         INSERT INTO inventory_alert_state(product_id, warehouse_id, current_status, current_quantity_micro, threshold_micro,
           last_alert_type, last_alert_at, resolved_at, updated_at)
         SELECT product_id, warehouse_id, next_status, quantity_micro, threshold_micro,
           CASE WHEN ${createsAlertSql} THEN next_status ELSE NULL END,
           CASE WHEN ${createsAlertSql} THEN ? ELSE NULL END,
           CASE WHEN next_status='NORMAL' THEN ? ELSE NULL END, ?
         FROM candidates WHERE true
         ON CONFLICT(product_id,warehouse_id) DO UPDATE SET current_status=excluded.current_status,
           current_quantity_micro=excluded.current_quantity_micro, threshold_micro=excluded.threshold_micro,
           last_alert_type=CASE WHEN excluded.last_alert_type IS NULL THEN inventory_alert_state.last_alert_type ELSE excluded.last_alert_type END,
           last_alert_at=CASE WHEN excluded.last_alert_at IS NULL THEN inventory_alert_state.last_alert_at ELSE excluded.last_alert_at END,
           resolved_at=excluded.resolved_at, updated_at=excluded.updated_at`,
        [settings.defaultLowStockThresholdMicro, now, now, now],
        false
      );
      await this.db.run(
        `UPDATE inventory_alerts SET resolved_at=COALESCE(resolved_at,?) WHERE resolved_at IS NULL AND EXISTS (
          SELECT 1 FROM inventory_alert_state state WHERE state.product_id=inventory_alerts.product_id
            AND state.warehouse_id=inventory_alerts.warehouse_id AND state.current_status<>inventory_alerts.alert_type
        )`,
        [now],
        false
      );
      await this.db.run(
        `UPDATE inventory_alerts SET resolved_at=COALESCE(resolved_at,?) WHERE resolved_at IS NULL AND (
          NOT EXISTS (SELECT 1 FROM products p WHERE p.id=inventory_alerts.product_id AND p.status='ACTIVE' AND p.deleted_at IS NULL)
          OR NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.id=inventory_alerts.warehouse_id AND w.deleted_at IS NULL)
        )`,
        [now],
        false
      );
    });

    const rows = await this.db.query<{
      id: string; product_id: string; product_name: string; warehouse_id: string; warehouse_name: string; inventory_unit: UnitCode;
      alert_type: "LOW_STOCK" | "OUT_OF_STOCK"; quantity_micro: number; threshold_micro: number; is_read: number;
      resolved_at: string | null; created_at: string;
    }>(
      `SELECT a.id, a.product_id, p.name AS product_name, a.warehouse_id, w.name AS warehouse_name, p.inventory_unit,
        a.alert_type, a.quantity_micro, a.threshold_micro, a.is_read, a.resolved_at, a.created_at
       FROM inventory_alerts a JOIN products p ON p.id=a.product_id JOIN warehouses w ON w.id=a.warehouse_id
       WHERE a.created_at=? ORDER BY a.created_at`,
      [now]
    );
    const alerts = rows.map((row) => this.mapAlert(row));
    if (!alerts.length) return [];
    void this.publishSystemNotifications(alerts, settings);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pos:inventory-alerts-created", { detail: { alerts } }));
    return alerts;
  }

  private async publishSystemNotifications(alerts: InventoryAlertRecord[], settings: Awaited<ReturnType<SettingsReportService["getSettings"]>>) {
    try {
      const publishedIds = await this.notifications.publish(alerts, settings);
      await this.markSystemNotified(publishedIds);
    } catch {
      // Persisted alerts remain available and can be published on the next app activation.
    }
  }

  private async markSystemNotified(alertIds: string[]) {
    if (!alertIds.length) return;
    const placeholders = alertIds.map(() => "?").join(",");
    await this.db.run(`UPDATE inventory_alerts SET system_notified_at=? WHERE id IN (${placeholders})`, [nowIso(), ...alertIds]);
  }

  async publishPendingSystemNotifications() {
    const settings = await this.settings.getSettings();
    const rows = await this.db.query<{
      id: string; product_id: string; product_name: string; warehouse_id: string; warehouse_name: string; inventory_unit: UnitCode;
      alert_type: "LOW_STOCK" | "OUT_OF_STOCK"; quantity_micro: number; threshold_micro: number; is_read: number;
      resolved_at: string | null; created_at: string;
    }>(
      `SELECT a.id, a.product_id, p.name AS product_name, a.warehouse_id, w.name AS warehouse_name, p.inventory_unit,
        a.alert_type, a.quantity_micro, a.threshold_micro, a.is_read, a.resolved_at, a.created_at
       FROM inventory_alerts a JOIN products p ON p.id=a.product_id JOIN warehouses w ON w.id=a.warehouse_id
       WHERE a.system_notified_at IS NULL AND a.resolved_at IS NULL AND a.cleared_at IS NULL ORDER BY a.created_at LIMIT 100`
    );
    const publishedIds = await this.notifications.publish(rows.map((row) => this.mapAlert(row)), settings);
    await this.markSystemNotified(publishedIds);
    return publishedIds.length;
  }

  async listAlerts(actor: LocalUser, includeCleared = false) {
    requireInventoryPermission(actor);
    const rows = await this.db.query<{
      id: string; product_id: string; product_name: string; warehouse_id: string; warehouse_name: string; inventory_unit: UnitCode;
      alert_type: "LOW_STOCK" | "OUT_OF_STOCK"; quantity_micro: number; threshold_micro: number; is_read: number;
      resolved_at: string | null; created_at: string;
    }>(
      `SELECT a.id, a.product_id, p.name AS product_name, a.warehouse_id, w.name AS warehouse_name, p.inventory_unit,
        a.alert_type, a.quantity_micro, a.threshold_micro, a.is_read, a.resolved_at, a.created_at
       FROM inventory_alerts a JOIN products p ON p.id=a.product_id JOIN warehouses w ON w.id=a.warehouse_id
       WHERE (?=1 OR a.cleared_at IS NULL) ORDER BY a.created_at DESC LIMIT 2000`,
      [includeCleared ? 1 : 0]
    );
    return rows.map((row) => this.mapAlert(row));
  }

  async listStockStatuses(actor: LocalUser): Promise<InventoryStatusRecord[]> {
    requireInventoryPermission(actor);
    const settings = await this.settings.getSettings();
    const snapshots = await this.snapshots();
    return snapshots.map((snapshot) => {
      const thresholdMicro = effectiveStockThreshold(Number(snapshot.minimum_stock_micro), settings.defaultLowStockThresholdMicro);
      const currentQuantityMicro = Number(snapshot.available_micro);
      return {
        productId: snapshot.product_id,
        productName: snapshot.product_name,
        warehouseId: snapshot.warehouse_id,
        warehouseName: snapshot.warehouse_name,
        inventoryUnit: snapshot.inventory_unit,
        status: stockAlertStatus(currentQuantityMicro, thresholdMicro),
        currentQuantityMicro,
        thresholdMicro
      };
    });
  }

  async unreadCount(actor: LocalUser) {
    requireInventoryPermission(actor);
    const rows = await this.db.query<{ count: number }>("SELECT COUNT(*) AS count FROM inventory_alerts WHERE is_read=0 AND cleared_at IS NULL");
    return Number(rows[0]?.count ?? 0);
  }

  async markRead(actor: LocalUser, alertId: string) {
    requireInventoryPermission(actor);
    await this.db.run("UPDATE inventory_alerts SET is_read=1 WHERE id=?", [alertId]);
  }

  async markAllRead(actor: LocalUser) {
    requireInventoryPermission(actor);
    await this.db.run("UPDATE inventory_alerts SET is_read=1 WHERE cleared_at IS NULL");
  }

  async clearRead(actor: LocalUser) {
    requireInventoryPermission(actor);
    await this.db.run("UPDATE inventory_alerts SET cleared_at=? WHERE is_read=1 AND cleared_at IS NULL", [nowIso()]);
  }
}
