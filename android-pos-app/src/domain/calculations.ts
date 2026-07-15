import { QUANTITY_SCALE, type CartLine } from "./models";

export function multiplyScaled(left: number, right: number) {
  return Math.round((left * right) / QUANTITY_SCALE);
}

export function toBaseQuantity(soldQuantityMicro: number, unitRatioMicro: number) {
  if (!Number.isSafeInteger(soldQuantityMicro) || soldQuantityMicro <= 0) throw new Error("Quantity must be greater than zero.");
  if (!Number.isSafeInteger(unitRatioMicro) || unitRatioMicro <= 0) throw new Error("Unit ratio must be greater than zero.");
  return multiplyScaled(soldQuantityMicro, unitRatioMicro);
}

export function lineTotals(line: CartLine) {
  const grossCents = Math.round((line.unitPriceCents * line.soldQuantityMicro) / QUANTITY_SCALE);
  const discountCents = Math.min(Math.max(0, line.discountCents), grossCents);
  const taxableCents = grossCents - discountCents;
  const taxCents = Math.round((taxableCents * line.taxBasisPoints) / 10_000);
  return { grossCents, discountCents, taxCents, totalCents: taxableCents + taxCents };
}

export function saleTotals(lines: CartLine[], serviceChargeCents = 0, tipCents = 0) {
  const totals = lines.map(lineTotals);
  const subtotalCents = totals.reduce((sum, total) => sum + total.grossCents, 0);
  const discountCents = totals.reduce((sum, total) => sum + total.discountCents, 0);
  const taxCents = totals.reduce((sum, total) => sum + total.taxCents, 0);
  const grandTotalCents = totals.reduce((sum, total) => sum + total.totalCents, 0) + serviceChargeCents + tipCents;
  return { subtotalCents, discountCents, taxCents, grandTotalCents };
}

export function assertSufficientPayment(paidCents: number, totalCents: number) {
  if (!Number.isSafeInteger(paidCents) || paidCents < totalCents) throw new Error("Payment total is less than the sale total.");
  return paidCents - totalCents;
}

