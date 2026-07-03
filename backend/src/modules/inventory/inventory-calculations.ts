export type MovementEffect = "INCREASE" | "DECREASE" | "SET";

export function calculateNextStock(currentQuantity: number, quantity: number, effect: MovementEffect) {
  if (!Number.isFinite(currentQuantity) || currentQuantity < 0) {
    throw new Error("Current quantity must be zero or greater.");
  }

  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Quantity must be zero or greater.");
  }

  const nextQuantity =
    effect === "INCREASE" ? currentQuantity + quantity : effect === "DECREASE" ? currentQuantity - quantity : quantity;

  if (nextQuantity < 0) {
    throw new Error("Inventory quantity cannot become negative.");
  }

  return Number(nextQuantity.toFixed(6));
}

export function calculateAdjustmentDelta(currentQuantity: number, countedQuantity: number) {
  return Number((calculateNextStock(currentQuantity, countedQuantity, "SET") - currentQuantity).toFixed(6));
}
