import { database } from "../data/database";
import { AuthService } from "./auth-service";
import { BackupService } from "./backup-service";
import { CashDrawerService } from "./cash-drawer-service";
import { CatalogService } from "./catalog-service";
import { ImportExportService } from "./import-export-service";
import { InventoryService } from "./inventory-service";
import { InventoryAlertService } from "./inventory-alert-service";
import { inventoryNotificationService } from "../platform/inventory-notification-service";
import { MobileReportService } from "./mobile-report-service";
import { ReportPdfService } from "./report-pdf-service";
import { AndroidPdfReceiptPrinter } from "./receipt-service";
import { RestaurantService } from "./restaurant-service";
import { SalesService } from "./sales-service";
import { SettingsReportService } from "./settings-report-service";
import { FactoryResetService } from "./factory-reset-service";
import { LicenseService } from "./license-service";

async function startupStep(label: string, operation: () => Promise<unknown>, timeoutMs = 20_000) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} did not finish in time. Restart the app and try again.`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class OfflinePosApplication {
  readonly database = database;
  readonly auth = new AuthService(database);
  readonly license = new LicenseService(database);
  readonly catalog = new CatalogService(database);
  readonly inventory = new InventoryService(database);
  readonly cashDrawer = new CashDrawerService(database);
  readonly sales = new SalesService(database, undefined, () => this.license.requireProtectedOperation());
  readonly restaurant = new RestaurantService(database);
  readonly settingsReports = new SettingsReportService(database);
  readonly inventoryNotifications = inventoryNotificationService;
  readonly inventoryAlerts = new InventoryAlertService(database, this.settingsReports, this.inventoryNotifications);
  readonly mobileReports = new MobileReportService(database, this.settingsReports);
  readonly reportPdf = new ReportPdfService();
  readonly backup = new BackupService(database);
  readonly factoryReset = new FactoryResetService(database, this.auth, this.backup, this.inventoryNotifications);
  readonly importExport = new ImportExportService(database, this.settingsReports);
  readonly receiptPrinter = new AndroidPdfReceiptPrinter();

  async initialize() {
    await startupStep("Opening the local database", () => database.initialize());
    await startupStep("Starting inventory notifications", () => this.inventoryNotifications.initialize());
    await startupStep("Refreshing inventory alerts", () => this.inventoryAlerts.initialize());
  }
}

export const offlineApp = new OfflinePosApplication();
