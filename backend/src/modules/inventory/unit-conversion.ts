import { z } from "zod";

const unitSchema = z.enum([
  "KILOGRAM",
  "GRAM",
  "LITER",
  "MILLILITER",
  "METER",
  "YARD",
  "CENTIMETER",
  "PIECE",
  "PACK",
  "CASE",
  "BUNDLE",
  "BOTTLE",
  "ROLL",
  "CUSTOM"
]);
export type UnitCode = z.infer<typeof unitSchema>;

const unitDefinitions: Record<UnitCode, { dimension: string; factor: number }> = {
  KILOGRAM: { dimension: "weight", factor: 1 },
  GRAM: { dimension: "weight", factor: 0.001 },
  LITER: { dimension: "volume", factor: 1 },
  MILLILITER: { dimension: "volume", factor: 0.001 },
  METER: { dimension: "length", factor: 1 },
  YARD: { dimension: "length", factor: 0.9144 },
  CENTIMETER: { dimension: "length", factor: 0.01 },
  PIECE: { dimension: "count", factor: 1 },
  PACK: { dimension: "count", factor: 1 },
  CASE: { dimension: "count", factor: 1 },
  BUNDLE: { dimension: "count", factor: 1 },
  BOTTLE: { dimension: "count", factor: 1 },
  ROLL: { dimension: "count", factor: 1 },
  CUSTOM: { dimension: "custom", factor: 1 }
};

export function convertToBaseQuantity(quantity: number, unit: UnitCode) {
  const parsedQuantity = z.number().positive().safeParse(quantity);
  if (!parsedQuantity.success) {
    throw new Error("Quantity must be greater than zero.");
  }

  const parsedUnit = unitSchema.parse(unit);
  return parsedQuantity.data * unitDefinitions[parsedUnit].factor;
}

export function convertQuantity(quantity: number, fromUnit: UnitCode, toUnit: UnitCode) {
  const parsedQuantity = z.number().positive().safeParse(quantity);
  if (!parsedQuantity.success) {
    throw new Error("Quantity must be greater than zero.");
  }

  const from = unitDefinitions[unitSchema.parse(fromUnit)];
  const to = unitDefinitions[unitSchema.parse(toUnit)];

  if (from.dimension !== to.dimension && from.dimension !== "custom" && to.dimension !== "custom") {
    throw new Error(`Cannot convert ${fromUnit} to ${toUnit}.`);
  }

  return Number(((parsedQuantity.data * from.factor) / to.factor).toFixed(6));
}

export function calculateVariableSaleLine(input: {
  packagePrice: number;
  packageSize: number;
  soldQuantity: number;
  soldUnit: UnitCode;
  inventoryUnit: UnitCode;
}) {
  const packagePrice = z.number().nonnegative().parse(input.packagePrice);
  const packageSize = z.number().positive().parse(input.packageSize);
  const baseQuantity = convertQuantity(input.soldQuantity, input.soldUnit, input.inventoryUnit);
  const unitPrice = packagePrice / packageSize;

  return {
    baseQuantity,
    unitPrice: Number(unitPrice.toFixed(6)),
    lineSubtotal: Number((unitPrice * baseQuantity).toFixed(2))
  };
}

export function calculateVariableUnitPrice(baseUnitPrice: number, soldQuantity: number, soldUnit: UnitCode) {
  const parsedPrice = z.number().nonnegative().safeParse(baseUnitPrice);
  if (!parsedPrice.success) {
    throw new Error("Base unit price cannot be negative.");
  }

  return Number((parsedPrice.data * convertToBaseQuantity(soldQuantity, soldUnit)).toFixed(2));
}
