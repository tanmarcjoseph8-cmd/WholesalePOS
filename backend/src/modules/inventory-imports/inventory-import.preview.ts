import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import type { Actor } from "../auth/actor.js";
import type { DuplicateAction, InventoryImportPreviewInput, InventoryImportRawRow } from "./inventory-import.schemas.js";
import {
  productStatuses,
  salesChannels,
  supportedUnits,
  type ImportPreviewRow,
  type ImportRowAction,
  type InventoryImportPreview,
  type NormalizedImportRow,
  type ProductCandidate
} from "./inventory-import.types.js";

const unitAliases: Record<string, (typeof supportedUnits)[number]> = {
  KG: "KILOGRAM",
  KGS: "KILOGRAM",
  KILOGRAMS: "KILOGRAM",
  G: "GRAM",
  GRAMS: "GRAM",
  L: "LITER",
  LITERS: "LITER",
  LITRES: "LITER",
  ML: "MILLILITER",
  MILLILITERS: "MILLILITER",
  M: "METER",
  METERS: "METER",
  METRES: "METER",
  YARDS: "YARD",
  CM: "CENTIMETER",
  CENTIMETERS: "CENTIMETER",
  PC: "PIECE",
  PCS: "PIECE",
  PIECES: "PIECE",
  PACKS: "PACK",
  CASES: "CASE",
  BUNDLES: "BUNDLE",
  BOTTLES: "BOTTLE",
  ROLLS: "ROLL"
};

function textCell(value: unknown, field: string, errors: string[], maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  if (text.length > maxLength) errors.push(`${field} must be ${maxLength} characters or fewer.`);
  return text.slice(0, maxLength);
}

function numberCell(value: unknown, field: string, errors: string[], options: { min?: number; max?: number } = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(String(value).replaceAll(",", "").trim());
  if (!Number.isFinite(parsed)) {
    errors.push(`${field} must be a valid number.`);
    return undefined;
  }
  if (options.min !== undefined && parsed < options.min) errors.push(`${field} cannot be less than ${options.min}.`);
  if (options.max !== undefined && parsed > options.max) errors.push(`${field} cannot exceed ${options.max}.`);
  return parsed;
}

function enumCell<T extends string>(value: unknown, field: string, values: readonly T[], aliases: Record<string, T>, errors: string[]) {
  const text = textCell(value, field, errors, 80)?.toUpperCase().replaceAll(" ", "_");
  if (!text) return undefined;
  const resolved = aliases[text] ?? (values.includes(text as T) ? (text as T) : undefined);
  if (!resolved) errors.push(`${field} is not supported.`);
  return resolved;
}

function dateCell(value: unknown, errors: string[]) {
  const text = textCell(value, "Expiration date", errors, 80);
  if (!text) return undefined;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    errors.push("Expiration date is invalid.");
    return undefined;
  }
  return date;
}

export function normalizeImportRow(raw: InventoryImportRawRow) {
  const errors: string[] = [];
  const warnings: string[] = [];
  let taxRate = numberCell(raw.taxRate, "Tax", errors, { min: 0, max: 100 });
  if (taxRate !== undefined && taxRate > 1) {
    taxRate /= 100;
    warnings.push("Tax was interpreted as a percentage.");
  }

  const normalized: NormalizedImportRow = {
    rowNumber: raw.rowNumber,
    productId: textCell(raw.productId, "Product ID", errors, 64),
    sku: textCell(raw.sku, "SKU", errors, 64),
    barcode: textCell(raw.barcode, "Barcode", errors, 64),
    name: textCell(raw.name, "Product name", errors, 160),
    variant: textCell(raw.variant, "Variant", errors, 120),
    salesChannel: enumCell(raw.salesChannel, "Product channel", salesChannels, {}, errors),
    description: textCell(raw.description, "Description", errors, 500),
    category: textCell(raw.category, "Category", errors, 160),
    brand: textCell(raw.brand, "Brand", errors, 160),
    supplier: textCell(raw.supplier, "Supplier", errors, 160),
    inventoryUnit: enumCell(raw.inventoryUnit, "Stock unit", supportedUnits, unitAliases, errors),
    sellingUnit: enumCell(raw.sellingUnit, "Selling unit", supportedUnits, unitAliases, errors),
    unitRatioToBase: numberCell(raw.unitRatioToBase, "Unit ratio", errors, { min: 0.000001, max: 999_999.999999 }),
    packageSize: numberCell(raw.packageSize, "Package size", errors, { min: 0.000001, max: 999_999.999999 }),
    costPrice: numberCell(raw.costPrice, "Cost price", errors, { min: 0, max: 999_999_999.99 }),
    retailPrice: numberCell(raw.retailPrice, "Selling price", errors, { min: 0, max: 999_999_999.99 }),
    wholesalePrice: numberCell(raw.wholesalePrice, "Wholesale price", errors, { min: 0, max: 999_999_999.99 }),
    vipPrice: numberCell(raw.vipPrice, "VIP price", errors, { min: 0, max: 999_999_999.99 }),
    stock: numberCell(raw.stock, "Stock", errors, { min: -999_999_999.999999, max: 999_999_999.999999 }),
    minimumStock: numberCell(raw.minimumStock, "Low stock alert", errors, { min: 0, max: 999_999_999.999999 }),
    taxRate,
    status: enumCell(raw.status, "Status", productStatuses, {}, errors),
    expiresAt: dateCell(raw.expiresAt, errors),
    batchNumber: textCell(raw.batchNumber, "Batch", errors, 160),
    branch: textCell(raw.branch, "Branch", errors, 160),
    location: textCell(raw.location, "Location", errors, 160),
    notes: textCell(raw.notes, "Notes", errors, 500),
    raw
  };

  return { normalized, errors, warnings };
}

function normalizedName(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
}

function productSnapshot(product: ProductCandidate) {
  return { id: product.id, sku: product.sku, name: product.name, variant: product.variant, updatedAt: product.updatedAt.toISOString() };
}

type ResolvedMatch = {
  method?: ImportPreviewRow["matchMethod"];
  product?: ProductCandidate;
  reviewCandidates?: ReturnType<typeof productSnapshot>[];
  skipNameMatch?: boolean;
};

function determineModeAction(mode: InventoryImportPreviewInput["mode"], matched: boolean): { action: ImportRowAction; warning?: string; error?: string } {
  if (mode === "ADD_NEW") return matched ? { action: "SKIP", warning: "An existing product matched this row; Add New skips it." } : { action: "CREATE" };
  if (mode === "UPDATE_EXISTING") return matched ? { action: "UPDATE" } : { action: "SKIP", warning: "No existing product matched this row; Update Existing skips it." };
  if (mode === "ADD_AND_UPDATE") return { action: matched ? "UPDATE" : "CREATE" };
  if (mode === "INITIAL_INVENTORY") return { action: matched ? "UPDATE" : "CREATE" };
  return matched ? { action: "STOCK" } : { action: "INVALID", error: "This stock-only mode requires an existing product match." };
}

function resolveMatch(
  row: NormalizedImportRow,
  maps: {
    byId: Map<string, ProductCandidate>;
    bySku: Map<string, ProductCandidate>;
    byBarcode: Map<string, ProductCandidate>;
    byNameVariant: Map<string, ProductCandidate[]>;
    byName: Map<string, ProductCandidate[]>;
  },
  duplicateAction: DuplicateAction,
  errors: string[],
  warnings: string[]
): ResolvedMatch {
  const explicitMatches: Array<{ method: ImportPreviewRow["matchMethod"]; product: ProductCandidate }> = [];
  if (row.productId) {
    const product = maps.byId.get(row.productId);
    if (!product) errors.push("Product ID does not match an active product.");
    else explicitMatches.push({ method: "PRODUCT_ID", product });
  }
  if (row.sku) {
    const product = maps.bySku.get(row.sku.toLocaleLowerCase());
    if (product) explicitMatches.push({ method: "SKU", product });
  }
  if (row.barcode) {
    const product = maps.byBarcode.get(row.barcode.toLocaleLowerCase());
    if (product) explicitMatches.push({ method: "BARCODE", product });
  }

  const uniqueExplicitIds = new Set(explicitMatches.map((match) => match.product.id));
  if (uniqueExplicitIds.size > 1) {
    errors.push("Product ID, SKU, and barcode point to different products.");
    return {};
  }
  const explicit = explicitMatches[0];
  if (explicit) return explicit;

  if (row.name && row.variant) {
    const matches = maps.byNameVariant.get(`${normalizedName(row.name)}\u0000${normalizedName(row.variant)}`) ?? [];
    if (matches.length === 1) return { method: "NAME_VARIANT" as const, product: matches[0] as ProductCandidate };
    if (matches.length > 1) {
      warnings.push("Multiple products share this name and variant; select a Product ID manually.");
      return { reviewCandidates: matches.map(productSnapshot) };
    }
  }

  if (row.name) {
    const matches = maps.byName.get(normalizedName(row.name)) ?? [];
    if (matches.length > 0) {
      if (matches.length === 1 && (duplicateAction === "UPDATE" || duplicateAction === "MERGE")) {
        warnings.push("The existing product was selected by product name after explicit duplicate confirmation.");
        return { method: "NAME" as const, product: matches[0] as ProductCandidate };
      }
      if (duplicateAction === "SKIP") {
        warnings.push("A possible product-name match was skipped by the duplicate rule.");
        return { skipNameMatch: true };
      }
      warnings.push("Product-name matching requires manual review; set the Product ID to confirm the match.");
      return { reviewCandidates: matches.map(productSnapshot) };
    }
  }

  return {};
}

function calculateStockDelta(mode: InventoryImportPreviewInput["mode"], action: ImportRowAction, requestedStock: number | undefined, previousStock: number) {
  if (action === "CREATE") return requestedStock ?? 0;
  if (mode === "ADD_STOCK") return requestedStock ?? 0;
  if (mode === "REPLACE_STOCK" || mode === "INITIAL_INVENTORY") return (requestedStock ?? previousStock) - previousStock;
  if (mode === "ADJUST_STOCK") return requestedStock ?? 0;
  return 0;
}

function createFingerprint(input: InventoryImportPreviewInput, rows: NormalizedImportRow[]) {
  const canonicalRows = rows.map(({ raw: _raw, expiresAt, ...row }) => ({ ...row, expiresAt: expiresAt?.toISOString() ?? null }));
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ warehouseId: input.warehouseId, mode: input.mode, sourceFingerprint: input.source.fingerprint ?? null, rows: canonicalRows }))
    .digest("hex");
}

export async function previewInventoryImport(input: InventoryImportPreviewInput, actor: Actor): Promise<InventoryImportPreview> {
  if (!actor.storeId) throw new AppError(400, "STORE_REQUIRED", "Inventory imports require a store.");

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, storeId: actor.storeId, deletedAt: null },
    select: { id: true, code: true, name: true }
  });
  if (!warehouse) throw new AppError(404, "WAREHOUSE_NOT_FOUND", "The selected warehouse was not found.");

  const candidates = await prisma.product.findMany({
    where: { deletedAt: null },
    include: {
      barcodes: true,
      stocks: { where: { warehouseId: warehouse.id } },
      category: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } }
    }
  });

  const byId = new Map(candidates.map((product) => [product.id, product]));
  const bySku = new Map(candidates.map((product) => [product.sku.toLocaleLowerCase(), product]));
  const byBarcode = new Map(candidates.flatMap((product) => product.barcodes.map((barcode) => [barcode.value.toLocaleLowerCase(), product] as const)));
  const byNameVariant = new Map<string, ProductCandidate[]>();
  const byName = new Map<string, ProductCandidate[]>();
  for (const product of candidates) {
    const name = normalizedName(product.name);
    const variant = normalizedName(product.variant ?? undefined);
    byName.set(name, [...(byName.get(name) ?? []), product]);
    if (variant) byNameVariant.set(`${name}\u0000${variant}`, [...(byNameVariant.get(`${name}\u0000${variant}`) ?? []), product]);
  }

  const normalizedRows = input.rows.map(normalizeImportRow);
  const duplicateSkuRows = new Map<string, number[]>();
  const duplicateBarcodeRows = new Map<string, number[]>();
  for (const { normalized } of normalizedRows) {
    if (normalized.sku) {
      const key = normalized.sku.toLocaleLowerCase();
      duplicateSkuRows.set(key, [...(duplicateSkuRows.get(key) ?? []), normalized.rowNumber]);
    }
    if (normalized.barcode) {
      const key = normalized.barcode.toLocaleLowerCase();
      duplicateBarcodeRows.set(key, [...(duplicateBarcodeRows.get(key) ?? []), normalized.rowNumber]);
    }
  }

  const rows: ImportPreviewRow[] = normalizedRows.map(({ normalized, errors, warnings }) => {
    if (normalized.sku && (duplicateSkuRows.get(normalized.sku.toLocaleLowerCase())?.length ?? 0) > 1) errors.push("SKU is duplicated in this import file.");
    if (normalized.barcode && (duplicateBarcodeRows.get(normalized.barcode.toLocaleLowerCase())?.length ?? 0) > 1) errors.push("Barcode is duplicated in this import file.");
    if (normalized.branch && ![warehouse.code, warehouse.name].some((value) => normalizedName(value) === normalizedName(normalized.branch))) {
      errors.push(`Branch must match the selected warehouse (${warehouse.code} - ${warehouse.name}).`);
    }

    const match = resolveMatch(normalized, { byId, bySku, byBarcode, byNameVariant, byName }, input.duplicateAction, errors, warnings);
    let modeResult = determineModeAction(input.mode, Boolean(match.product));
    if (match.reviewCandidates) modeResult = { action: "REVIEW" };
    if (match.skipNameMatch) modeResult = { action: "SKIP" };

    if (modeResult.warning) warnings.push(modeResult.warning);
    if (modeResult.error) errors.push(modeResult.error);
    if (modeResult.action === "CREATE" && (!normalized.name || normalized.name.length < 2)) errors.push("Product name is required when creating a product.");
    if (["ADD_STOCK", "REPLACE_STOCK", "ADJUST_STOCK", "INITIAL_INVENTORY"].includes(input.mode) && normalized.stock === undefined) {
      errors.push("Stock is required for this import mode.");
    }
    if (input.mode !== "ADJUST_STOCK" && normalized.stock !== undefined && normalized.stock < 0) errors.push("Stock cannot be negative for this import mode.");

    const previousStock = match.product ? Number(match.product.stocks[0]?.quantity ?? 0) : 0;
    const stockDelta = calculateStockDelta(input.mode, modeResult.action, normalized.stock, previousStock);
    if (previousStock + stockDelta < 0) errors.push("This adjustment would make inventory negative.");

    const action = errors.length > 0 ? "INVALID" : modeResult.action;
    const status = errors.length > 0 ? "INVALID" : warnings.length > 0 || action === "SKIP" || action === "REVIEW" ? "WARNING" : "VALID";
    return {
      rowNumber: normalized.rowNumber,
      status,
      action,
      matchMethod: match.method,
      matchedProduct: match.product ? productSnapshot(match.product) : undefined,
      normalized,
      warnings,
      errors,
      previousStock: match.product ? previousStock : undefined,
      stockDelta
    };
  });

  const matchedRows = new Map<string, ImportPreviewRow[]>();
  for (const row of rows) {
    if (!row.matchedProduct || row.action === "SKIP") continue;
    matchedRows.set(row.matchedProduct.id, [...(matchedRows.get(row.matchedProduct.id) ?? []), row]);
  }
  for (const duplicates of matchedRows.values()) {
    if (duplicates.length < 2) continue;
    for (const row of duplicates) {
      row.errors.push("Multiple rows in this import resolve to the same product. Keep one row or select a different Product ID.");
      row.action = "INVALID";
      row.status = "INVALID";
      row.stockDelta = 0;
    }
  }

  const fingerprint = createFingerprint(input, normalizedRows.map((row) => row.normalized));
  const duplicateBatch = await prisma.inventoryImportBatch.findFirst({
    where: { storeId: actor.storeId, fingerprint, status: { in: ["COMPLETED", "PARTIAL"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, sourceName: true, createdAt: true, status: true }
  });

  return {
    fingerprint,
    duplicateBatch,
    mode: input.mode,
    warehouse,
    rows,
    summary: {
      rowCount: rows.length,
      validCount: rows.filter((row) => row.status === "VALID").length,
      warningCount: rows.filter((row) => row.status === "WARNING").length,
      invalidCount: rows.filter((row) => row.status === "INVALID").length,
      createCount: rows.filter((row) => row.action === "CREATE").length,
      updateCount: rows.filter((row) => row.action === "UPDATE").length,
      stockCount: rows.filter((row) => row.action === "STOCK" || row.stockDelta !== 0).length,
      skippedCount: rows.filter((row) => row.action === "SKIP" || row.action === "INVALID").length,
      reviewCount: rows.filter((row) => row.action === "REVIEW").length,
      stockDelta: rows.filter((row) => row.action !== "INVALID" && row.action !== "REVIEW").reduce((sum, row) => sum + row.stockDelta, 0)
    }
  };
}
