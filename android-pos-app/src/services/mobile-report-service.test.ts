import { describe, expect, it } from "vitest";
import type { LocalDatabase } from "../data/database";
import type { AppSettings, LocalUser } from "../domain/models";
import { MobileReportService } from "./mobile-report-service";
import type { SettingsReportService } from "./settings-report-service";

const settings: AppSettings = {
  businessName: "Test Store",
  businessMode: "RETAIL",
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

const cashier: LocalUser = { id: "cashier", name: "Cashier", login: "cashier", role: "CASHIER", permissions: ["sales.manage"] };
const owner: LocalUser = { id: "owner", name: "Owner", login: "owner", role: "OWNER", permissions: ["*"] };

describe("MobileReportService", () => {
  it("enforces report permission before querying local data", async () => {
    let queried = false;
    const db = { query: async () => { queried = true; return []; } } as unknown as LocalDatabase;
    const service = new MobileReportService(db, { getSettings: async () => settings } as SettingsReportService);

    await expect(service.getSalesReport(cashier, "TODAY")).rejects.toThrow("Reports permission is required");
    expect(queried).toBe(false);
  });

  it("subtracts cash change from payment totals", async () => {
    const queries: string[] = [];
    const db = { query: async (sql: string) => { queries.push(sql); return []; } } as unknown as LocalDatabase;
    const service = new MobileReportService(db, { getSettings: async () => settings } as SettingsReportService);

    const report = await service.getSalesReport(owner, "TODAY");
    const paymentQuery = queries.find((sql) => sql.includes("FROM sale_payments"));
    const transactionQuery = queries.find((sql) => sql.includes("payment_methods AS"));

    expect(report.summary.netSalesCents).toBe(0);
    expect(queries.filter((sql) => /\b(sales|sale_items|sale_payments|refunds|refund_payments)\b/.test(sql)).every((sql) => sql.includes("s.status IN"))).toBe(true);
    expect(paymentQuery).toContain("s.change_total_cents");
    expect(paymentQuery).toContain("sp.method='CASH'");
    expect(transactionQuery).toContain("LIMIT 500");
    expect(queries.some((sql) => sql.includes("SUM(s.grand_total_cents)"))).toBe(true);
    expect(queries.some((sql) => sql.includes("FROM cash_sessions"))).toBe(true);
    expect(report.cashDrawer.sessionCount).toBe(0);
  });
});
