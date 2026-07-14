export const realtimeEvents = {
  saleCreated: "sale:created",
  inventoryReceived: "inventory:received",
  inventoryAdjusted: "inventory:adjusted",
  productCreated: "product:created",
  productUpdated: "product:updated",
  priceChanged: "price:changed",
  customerChanged: "customer:changed",
  supplierChanged: "supplier:changed",
  purchaseOrderCompleted: "purchase-order:completed",
  restaurantChanged: "restaurant:changed"
} as const;

export type RealtimeEventName = (typeof realtimeEvents)[keyof typeof realtimeEvents];
