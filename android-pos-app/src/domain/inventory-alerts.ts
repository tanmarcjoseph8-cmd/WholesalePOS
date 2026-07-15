import type { StockAlertStatus } from "./models";

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
