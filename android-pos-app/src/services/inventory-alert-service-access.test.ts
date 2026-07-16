import { describe, expect, it } from "vitest";
import type { LocalDatabase } from "../data/database";
import type { LocalUser } from "../domain/models";
import type { InventoryNotificationService } from "../platform/inventory-notification-service";
import { InventoryAlertService } from "./inventory-alert-service";
import type { SettingsReportService } from "./settings-report-service";

const cashier: LocalUser = {
  id: "cashier",
  name: "Cashier",
  login: "cashier",
  role: "CASHIER",
  permissions: ["sales.manage", "inventory.alerts.view"]
};

describe("InventoryAlertService read-only access", () => {
  it("lets cashiers list specific stock statuses with alert permission", async () => {
    const db = { query: async () => [] } as unknown as LocalDatabase;
    const settings = { getSettings: async () => ({ defaultLowStockThresholdMicro: 0 }) } as unknown as SettingsReportService;
    const service = new InventoryAlertService(db, settings, {} as InventoryNotificationService);

    await expect(service.listStockStatuses(cashier)).resolves.toEqual([]);
  });

  it("rejects alert reads when no inventory alert permission exists", async () => {
    let queried = false;
    const db = { query: async () => { queried = true; return []; } } as unknown as LocalDatabase;
    const service = new InventoryAlertService(db, {} as SettingsReportService, {} as InventoryNotificationService);

    await expect(service.listAlerts({ ...cashier, permissions: ["sales.manage"] })).rejects.toThrow("Inventory alert permission is required");
    expect(queried).toBe(false);
  });
});
