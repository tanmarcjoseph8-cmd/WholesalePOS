import { database } from "../data/database";
import { AuthService } from "./auth-service";
import { BackupService } from "./backup-service";
import { CatalogService } from "./catalog-service";
import { ImportExportService } from "./import-export-service";
import { InventoryService } from "./inventory-service";
import { AndroidPdfReceiptPrinter } from "./receipt-service";
import { RestaurantService } from "./restaurant-service";
import { SalesService } from "./sales-service";
import { SettingsReportService } from "./settings-report-service";

export class OfflinePosApplication {
  readonly database = database;
  readonly auth = new AuthService(database);
  readonly catalog = new CatalogService(database);
  readonly inventory = new InventoryService(database);
  readonly sales = new SalesService(database);
  readonly restaurant = new RestaurantService(database);
  readonly settingsReports = new SettingsReportService(database);
  readonly backup = new BackupService(database);
  readonly importExport = new ImportExportService(database, this.settingsReports);
  readonly receiptPrinter = new AndroidPdfReceiptPrinter();

  async initialize() {
    await database.initialize();
  }
}

export const offlineApp = new OfflinePosApplication();

