import { z } from "zod";

const unitSchema = z.enum(["KILOGRAM", "GRAM", "LITER", "MILLILITER", "METER", "CENTIMETER", "PIECE", "PACK", "CASE", "BUNDLE", "BOTTLE", "ROLL"]);
export type UnitCode = z.infer<typeof unitSchema>;

const conversionToBase: Record<UnitCode, number> = {
  KILOGRAM: 1,
  GRAM: 0.001,
  LITER: 1,
  MILLILITER: 0.001,
  METER: 1,
  CENTIMETER: 0.01,
  PIECE: 1,
  PACK: 1,
  CASE: 1,
  BUNDLE: 1,
  BOTTLE: 1,
  ROLL: 1
};

export function convertToBaseQuantity(quantity: number, unit: UnitCode) {
  const parsedQuantity = z.number().positive().safeParse(quantity);
  if (!parsedQuantity.success) {
    throw new Error("Quantity must be greater than zero.");
  }

  const parsedUnit = unitSchema.parse(unit);
  return parsedQuantity.data * conversionToBase[parsedUnit];
}

export function calculateVariableUnitPrice(baseUnitPrice: number, soldQuantity: number, soldUnit: UnitCode) {
  const parsedPrice = z.number().nonnegative().safeParse(baseUnitPrice);
  if (!parsedPrice.success) {
    throw new Error("Base unit price cannot be negative.");
  }

  return Number((parsedPrice.data * convertToBaseQuantity(soldQuantity, soldUnit)).toFixed(2));
}
