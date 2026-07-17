import type { LocalDatabase } from "../data/database";
import { nowIso, type AppSettings, type DashboardSnapshot, type LocalUser } from "../domain/models";
import { audit } from "./service-helpers";
import { effectiveStockThreshold } from "../domain/inventory-alerts";
import { reportRange } from "../domain/reporting";

const defaults: AppSettings = {
  businessName: "Suki Sync Store",
  businessMode: "HYBRID",
  currency: "PHP",
  businessTimezone: "Asia/Manila",
  paperWidth: "80mm",
  receiptFooter: "Thank you",
  serviceChargeBasisPoints: 0,
  customOrderTypes: [],
  defaultLowStockThresholdMicro: 0,
  inventoryNotificationsEnabled: true,
  lowStockNotificationsEnabled: true,
  outOfStockNotificationsEnabled: true,
  inventoryNotificationSound: true,
  darkMode: false
};

export class SettingsReportService {
  constructor(private db: LocalDatabase) {}

  async getSettings() {
    const rows = await this.db.query<{ value_json: string }>("SELECT value_json FROM settings WHERE key='app'");
    const saved = rows[0] ? JSON.parse(rows[0].value_json) as Partial<AppSettings> : {};
    return { ...defaults, ...saved };
  }

  async updateSettings(actor: LocalUser, settings: AppSettings) {
    if (!actor.permissions.includes("*") && !actor.permissions.includes("settings.manage")) throw new Error("Settings permission is required.");
    if (!Number.isSafeInteger(settings.defaultLowStockThresholdMicro) || settings.defaultLowStockThresholdMicro < 0) throw new Error("Default low-stock threshold must be a valid non-negative quantity.");
    try {
      new Intl.DateTimeFormat("en-PH", { timeZone: settings.businessTimezone }).format();
    } catch {
      throw new Error("Enter a valid IANA business timezone, such as Asia/Manila.");
    }
    const now = nowIso();
    await this.db.transaction(async () => {
      await this.db.run(
        "INSERT INTO settings(key, value_json, updated_at, updated_by) VALUES ('app', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by",
        [JSON.stringify(settings), now, actor.id],
        false
      );
      await audit(this.db, { actorId: actor.id, action: "SETTINGS_UPDATED", entityType: "Setting", entityId: "app" });
    });
  }

  async dashboard(): Promise<DashboardSnapshot> {
    const settings = await this.getSettings();
    const today = reportRange("TODAY", settings.businessTimezone);
    const sales = await this.db.query<{ total: number; count: number }>(
      "SELECT COALESCE(SUM(grand_total_cents),0) AS total, COUNT(*) AS count FROM sales WHERE created_at>=? AND created_at<? AND status IN ('COMPLETED','PARTIALLY_REFUNDED') AND deleted_at IS NULL",
      [today.startIso, today.endExclusiveIso]
    );
    const stock = await this.db.query<{ available: number; low_count: number }>(
      `SELECT COALESCE(SUM(ai.available_micro),0) AS available,
        COALESCE(SUM(CASE WHEN ai.available_micro <= CASE WHEN p.minimum_stock_micro>0 THEN p.minimum_stock_micro ELSE ? END THEN 1 ELSE 0 END),0) AS low_count
       FROM available_inventory ai JOIN products p ON p.id=ai.product_id WHERE p.status='ACTIVE' AND p.deleted_at IS NULL`
      , [effectiveStockThreshold(0, settings.defaultLowStockThresholdMicro)]
    );
    const orders = await this.db.query<{ count: number }>("SELECT COUNT(*) AS count FROM orders WHERE status NOT IN ('COMPLETED','CANCELLED') AND deleted_at IS NULL");
    const tables = await this.db.query<{ count: number }>("SELECT COUNT(*) AS count FROM restaurant_tables WHERE active_order_id IS NOT NULL AND is_active=1 AND deleted_at IS NULL");
    return {
      todaySalesCents: Number(sales[0]?.total ?? 0),
      todaySalesCount: Number(sales[0]?.count ?? 0),
      availableStockMicro: Number(stock[0]?.available ?? 0),
      lowStockCount: Number(stock[0]?.low_count ?? 0),
      openOrderCount: Number(orders[0]?.count ?? 0),
      occupiedTableCount: Number(tables[0]?.count ?? 0)
    };
  }

  async salesReport(from: string, to: string) {
    const settings = await this.getSettings();
    const range = reportRange("CUSTOM", settings.businessTimezone, { fromDate: from, toDate: to });
    return this.db.query<{
      receipt_number: string; order_type: string; status: string; grand_total_cents: number; cashier_name: string; created_at: string;
    }>(
      `SELECT s.receipt_number, s.order_type, s.status, s.grand_total_cents, u.name AS cashier_name, s.created_at
       FROM sales s JOIN users u ON u.id=s.cashier_id WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL ORDER BY s.created_at DESC`,
      [range.startIso, range.endExclusiveIso]
    );
  }

  async inventoryReport() {
    return this.db.query<{
      sku: string; name: string; physical_micro: number; reserved_micro: number; available_micro: number; minimum_stock_micro: number;
    }>(
      `SELECT p.sku, p.name, COALESCE(SUM(ai.physical_micro),0) AS physical_micro, COALESCE(SUM(ai.reserved_micro),0) AS reserved_micro,
        COALESCE(SUM(ai.available_micro),0) AS available_micro, p.minimum_stock_micro
       FROM products p LEFT JOIN available_inventory ai ON ai.product_id=p.id WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY p.name`
    );
  }
}
