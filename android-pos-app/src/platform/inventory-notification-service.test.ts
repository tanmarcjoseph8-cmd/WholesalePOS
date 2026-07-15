import { describe, expect, it } from "vitest";
import type { AppSettings } from "../domain/models";
import { InventoryNotificationService } from "./inventory-notification-service";

const settings: AppSettings = {
  businessName: "Test",
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

describe("Android inventory notifications", () => {
  it("handles denied notification permission without scheduling", async () => {
    let scheduled = 0;
    const adapter = {
      createChannel: async () => undefined,
      addListener: async () => ({ remove: async () => undefined }),
      checkPermissions: async () => ({ display: "prompt" }),
      requestPermissions: async () => ({ display: "denied" }),
      schedule: async () => { scheduled += 1; return { notifications: [] }; }
    };
    const service = new InventoryNotificationService(adapter as never, () => true);
    expect(await service.activate(settings)).toBe("denied");
    await service.publish([{ id: "alert", productId: "p1", productName: "Water", warehouseId: "w1", warehouseName: "Main", inventoryUnit: "PIECE", alertType: "LOW_STOCK", currentQuantityMicro: 1_000_000, thresholdMicro: 2_000_000, isRead: false, isResolved: false, createdAt: new Date().toISOString() }], settings);
    expect(scheduled).toBe(0);
  });

  it("preserves a product target when the app opens from a notification", async () => {
    let actionListener: ((action: { notification: { extra: { productId: string } } }) => void) | null = null;
    const adapter = {
      createChannel: async () => undefined,
      addListener: async (_name: string, listener: typeof actionListener) => { actionListener = listener; return { remove: async () => undefined }; },
      checkPermissions: async () => ({ display: "granted" }),
      requestPermissions: async () => ({ display: "granted" }),
      schedule: async () => ({ notifications: [] })
    };
    const service = new InventoryNotificationService(adapter as never, () => true);
    await service.initialize();
    const listener = actionListener as unknown as (action: { notification: { extra: { productId: string } } }) => void;
    listener({ notification: { extra: { productId: "product-42" } } });
    expect(service.consumePendingTarget()).toEqual({ productId: "product-42", alertId: undefined });
    expect(service.consumePendingTarget()).toBeNull();
  });
});
