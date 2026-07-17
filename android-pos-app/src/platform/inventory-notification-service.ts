import { Capacitor } from "@capacitor/core";
import { LocalNotifications, type PermissionStatus } from "@capacitor/local-notifications";
import { formatQuantity, type AppSettings, type InventoryAlertRecord } from "../domain/models";

type NotificationAdapter = Pick<typeof LocalNotifications, "addListener" | "checkPermissions" | "createChannel" | "requestPermissions" | "schedule">
  & Partial<Pick<typeof LocalNotifications, "cancel" | "getPending" | "removeAllDeliveredNotifications">>;

function notificationId(alertId: string) {
  let hash = 0;
  for (let index = 0; index < alertId.length; index += 1) hash = ((hash << 5) - hash + alertId.charCodeAt(index)) | 0;
  return hash === 0 ? 1 : hash;
}

export class InventoryNotificationService {
  private initialized = false;
  private pendingTarget: { productId: string; alertId?: string } | null = null;

  constructor(private adapter: NotificationAdapter = LocalNotifications, private isNative: () => boolean = () => Capacitor.isNativePlatform()) {}

  async initialize() {
    if (this.initialized || !this.isNative()) return;
    await this.adapter.createChannel({ id: "inventory-alerts", name: "Inventory Alerts", description: "Low-stock and out-of-stock alerts", importance: 4, sound: "default", vibration: true });
    await this.adapter.createChannel({ id: "inventory-alerts-silent", name: "Inventory Alerts (Silent)", description: "Silent low-stock and out-of-stock alerts", importance: 2, vibration: false });
    await this.adapter.addListener("localNotificationActionPerformed", (action) => {
      const extra = action.notification.extra as { productId?: string; alertId?: string } | undefined;
      if (extra?.productId) {
        this.pendingTarget = { productId: extra.productId, alertId: extra.alertId };
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pos:open-inventory-alert", { detail: extra }));
      }
    });
    this.initialized = true;
  }

  consumePendingTarget() {
    const target = this.pendingTarget;
    this.pendingTarget = null;
    return target;
  }

  async permissionStatus(): Promise<PermissionStatus["display"] | "unavailable"> {
    if (!this.isNative()) return "unavailable";
    return (await this.adapter.checkPermissions()).display;
  }

  async activate(settings: AppSettings) {
    await this.initialize();
    if (!this.isNative() || !settings.inventoryNotificationsEnabled) return this.permissionStatus();
    let status = await this.adapter.checkPermissions();
    if (status.display === "prompt" || status.display === "prompt-with-rationale") status = await this.adapter.requestPermissions();
    return status.display;
  }

  async publish(alerts: InventoryAlertRecord[], settings: AppSettings) {
    if (!alerts.length || !settings.inventoryNotificationsEnabled || !this.isNative()) return [];
    await this.initialize();
    if ((await this.adapter.checkPermissions()).display !== "granted") return [];
    const enabled = alerts
      .filter((alert) => alert.alertType === "OUT_OF_STOCK" ? settings.outOfStockNotificationsEnabled : settings.lowStockNotificationsEnabled)
      .slice(0, 100);
    if (!enabled.length) return [];
    await this.adapter.schedule({
      notifications: enabled.map((alert) => ({
        id: notificationId(alert.id),
        title: alert.alertType === "OUT_OF_STOCK" ? `Out of stock: ${alert.productName}` : `Low stock: ${alert.productName}`,
        body: alert.alertType === "OUT_OF_STOCK"
          ? `${alert.warehouseName} has no stock remaining.`
          : `${formatQuantity(alert.currentQuantityMicro)} ${alert.inventoryUnit.toLowerCase()} remaining; threshold ${formatQuantity(alert.thresholdMicro)}.`,
        channelId: settings.inventoryNotificationSound ? "inventory-alerts" : "inventory-alerts-silent",
        group: "inventory-alerts",
        autoCancel: true,
        extra: { alertId: alert.id, productId: alert.productId }
      }))
    });
    return enabled.map((alert) => alert.id);
  }

  async clearAll() {
    if (!this.isNative()) return;
    const pending = await this.adapter.getPending?.();
    if (pending?.notifications.length) await this.adapter.cancel?.({ notifications: pending.notifications });
    await this.adapter.removeAllDeliveredNotifications?.();
    this.pendingTarget = null;
  }
}

export const inventoryNotificationService = new InventoryNotificationService();
