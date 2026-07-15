import { formatQuantity, type InventoryAlertRecord, type StockAlertStatus } from "./models";

export function stockAlertStatus(quantityMicro: number, thresholdMicro: number): StockAlertStatus {
  if (quantityMicro <= 0) return "OUT_OF_STOCK";
  if (thresholdMicro > 0 && quantityMicro <= thresholdMicro) return "LOW_STOCK";
  return "NORMAL";
}

export function shouldCreateStockAlert(previous: StockAlertStatus | null, next: StockAlertStatus) {
  return next !== "NORMAL" && previous !== next;
}

export function effectiveStockThreshold(productThresholdMicro: number, defaultThresholdMicro: number) {
  return productThresholdMicro > 0 ? productThresholdMicro : Math.max(0, defaultThresholdMicro);
}

export function inventoryAlertMessage(alerts: InventoryAlertRecord[]) {
  if (!alerts.length) return "";
  const details = alerts.slice(0, 3).map((alert) => alert.alertType === "OUT_OF_STOCK"
    ? `${alert.productName} (out of stock)`
    : `${alert.productName} (${formatQuantity(alert.currentQuantityMicro)} ${alert.inventoryUnit.toLowerCase()} left)`);
  const remaining = alerts.length - details.length;
  return `${alerts.length === 1 ? "Stock alert" : "Stock alerts"}: ${details.join("; ")}${remaining > 0 ? `; +${remaining} more` : ""}.`;
}
