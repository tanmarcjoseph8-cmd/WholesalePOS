import type { Prisma } from "@prisma/client";
import type { InventoryImportMode, InventoryImportRawRow } from "./inventory-import.schemas.js";

export const supportedUnits = [
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
] as const;

export const productStatuses = ["ACTIVE", "INACTIVE", "DISCONTINUED"] as const;
export const salesChannels = ["RETAIL", "RESTAURANT", "BOTH"] as const;

export type NormalizedImportRow = {
  rowNumber: number;
  productId?: string;
  sku?: string;
  barcode?: string;
  name?: string;
  variant?: string;
  salesChannel?: (typeof salesChannels)[number];
  description?: string;
  category?: string;
  brand?: string;
  supplier?: string;
  inventoryUnit?: (typeof supportedUnits)[number];
  sellingUnit?: (typeof supportedUnits)[number];
  unitRatioToBase?: number;
  packageSize?: number;
  costPrice?: number;
  retailPrice?: number;
  wholesalePrice?: number;
  vipPrice?: number;
  stock?: number;
  minimumStock?: number;
  taxRate?: number;
  status?: (typeof productStatuses)[number];
  expiresAt?: Date | null;
  batchNumber?: string;
  branch?: string;
  location?: string;
  notes?: string;
  raw: InventoryImportRawRow;
};

export type ProductCandidate = Prisma.ProductGetPayload<{
  include: {
    barcodes: true;
    stocks: true;
    category: { select: { id: true; name: true } };
    supplier: { select: { id: true; name: true } };
  };
}>;

export type ImportRowAction = "CREATE" | "UPDATE" | "STOCK" | "SKIP" | "REVIEW" | "INVALID";
export type ImportRowStatus = "VALID" | "WARNING" | "INVALID";

export type ImportPreviewRow = {
  rowNumber: number;
  status: ImportRowStatus;
  action: ImportRowAction;
  matchMethod?: "PRODUCT_ID" | "SKU" | "BARCODE" | "NAME_VARIANT" | "NAME";
  matchedProduct?: { id: string; sku: string; name: string; variant: string | null; updatedAt: string };
  normalized: NormalizedImportRow;
  warnings: string[];
  errors: string[];
  previousStock?: number;
  stockDelta: number;
};

export type InventoryImportPreview = {
  fingerprint: string;
  duplicateBatch: { id: string; sourceName: string; createdAt: Date; status: string } | null;
  mode: InventoryImportMode;
  warehouse: { id: string; code: string; name: string };
  rows: ImportPreviewRow[];
  summary: {
    rowCount: number;
    validCount: number;
    warningCount: number;
    invalidCount: number;
    createCount: number;
    updateCount: number;
    stockCount: number;
    skippedCount: number;
    reviewCount: number;
    stockDelta: number;
  };
};
