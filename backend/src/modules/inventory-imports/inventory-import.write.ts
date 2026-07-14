import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../shared/app-error.js";
import { findPriceChanges } from "../products/product-pricing.js";
import type { InventoryImportMode } from "./inventory-import.schemas.js";
import type { ImportPreviewRow, NormalizedImportRow } from "./inventory-import.types.js";

type Transaction = Prisma.TransactionClient;

type ProductWithBarcodes = Prisma.ProductGetPayload<{ include: { barcodes: true } }>;

export type ProductImportSnapshot = {
  id: string;
  sku: string;
  name: string;
  variant: string | null;
  salesChannel: string;
  description: string | null;
  imageUrl: string | null;
  brand: string | null;
  categoryId: string | null;
  supplierId: string | null;
  inventoryUnit: string;
  sellingUnit: string;
  unitRatioToBase: number;
  packageSize: number;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  vipPrice: number;
  wholesaleThreshold: number;
  taxRate: number;
  minimumStock: number;
  maximumStock: number | null;
  status: string;
  expiresAt: string | null;
  batchNumber: string | null;
  location: string | null;
  notes: string | null;
  deletedAt: string | null;
  updatedAt: string;
  barcodes: Array<{ value: string; isPrimary: boolean }>;
};

export function snapshotProduct(product: ProductWithBarcodes): ProductImportSnapshot {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    variant: product.variant,
    salesChannel: product.salesChannel,
    description: product.description,
    imageUrl: product.imageUrl,
    brand: product.brand,
    categoryId: product.categoryId,
    supplierId: product.supplierId,
    inventoryUnit: product.inventoryUnit,
    sellingUnit: product.sellingUnit,
    unitRatioToBase: Number(product.unitRatioToBase),
    packageSize: Number(product.packageSize),
    costPrice: Number(product.costPrice),
    retailPrice: Number(product.retailPrice),
    wholesalePrice: Number(product.wholesalePrice),
    vipPrice: Number(product.vipPrice),
    wholesaleThreshold: Number(product.wholesaleThreshold),
    taxRate: Number(product.taxRate),
    minimumStock: Number(product.minimumStock),
    maximumStock: product.maximumStock === null ? null : Number(product.maximumStock),
    status: product.status,
    expiresAt: product.expiresAt?.toISOString() ?? null,
    batchNumber: product.batchNumber,
    location: product.location,
    notes: product.notes,
    deletedAt: product.deletedAt?.toISOString() ?? null,
    updatedAt: product.updatedAt.toISOString(),
    barcodes: product.barcodes.map((barcode) => ({ value: barcode.value, isPrimary: barcode.isPrimary }))
  };
}

function jsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function autoSku() {
  return `AUTO-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

async function resolveCategoryId(transaction: Transaction, name: string | undefined) {
  if (!name) return undefined;
  const categories = await transaction.category.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const existing = categories.find((category) => category.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0);
  return existing?.id ?? (await transaction.category.create({ data: { name }, select: { id: true } })).id;
}

async function resolveSupplierId(transaction: Transaction, name: string | undefined) {
  if (!name) return undefined;
  const suppliers = await transaction.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const existing = suppliers.find((supplier) => supplier.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0);
  return existing?.id ?? (await transaction.supplier.create({ data: { name }, select: { id: true } })).id;
}

async function createImportedProduct(transaction: Transaction, row: NormalizedImportRow, warehouseIds: string[], actorId: string) {
  const inventoryUnit = row.inventoryUnit ?? "PIECE";
  const sellingUnit = row.sellingUnit ?? inventoryUnit;
  const retailPrice = row.retailPrice ?? 0;
  const wholesalePrice = row.wholesalePrice ?? retailPrice;
  const barcode = row.barcode;
  const product = await transaction.product.create({
    data: {
      sku: row.sku ?? barcode ?? autoSku(),
      name: row.name as string,
      variant: row.variant,
      salesChannel: row.salesChannel ?? "RETAIL",
      description: row.description,
      brand: row.brand,
      categoryId: await resolveCategoryId(transaction, row.category),
      supplierId: await resolveSupplierId(transaction, row.supplier),
      inventoryUnit,
      sellingUnit,
      unitRatioToBase: row.unitRatioToBase ?? 1,
      packageSize: row.packageSize ?? 1,
      costPrice: row.costPrice ?? 0,
      retailPrice,
      wholesalePrice,
      vipPrice: row.vipPrice ?? wholesalePrice,
      wholesaleThreshold: 0,
      taxRate: row.taxRate ?? 0,
      minimumStock: row.minimumStock ?? 0,
      status: row.status ?? "ACTIVE",
      expiresAt: row.expiresAt,
      batchNumber: row.batchNumber,
      location: row.location,
      notes: row.notes,
      ...(barcode ? { barcodes: { create: [{ value: barcode, isPrimary: true }] } } : {})
    },
    include: { barcodes: true }
  });

  if (warehouseIds.length > 0) {
    await transaction.inventoryStock.createMany({ data: warehouseIds.map((warehouseId) => ({ warehouseId, productId: product.id, quantity: 0 })) });
  }
  await transaction.auditLog.create({
    data: {
      actorId,
      action: "PRODUCT_CREATED_BY_IMPORT",
      entityType: "Product",
      entityId: product.id,
      metadata: { sku: product.sku, name: product.name }
    }
  });
  return product;
}

function productUpdateData(row: NormalizedImportRow, categoryId: string | undefined, supplierId: string | undefined): Prisma.ProductUpdateInput {
  return {
    ...(row.sku !== undefined ? { sku: row.sku } : {}),
    ...(row.name !== undefined ? { name: row.name } : {}),
    ...(row.variant !== undefined ? { variant: row.variant } : {}),
    ...(row.salesChannel !== undefined ? { salesChannel: row.salesChannel } : {}),
    ...(row.description !== undefined ? { description: row.description } : {}),
    ...(row.brand !== undefined ? { brand: row.brand } : {}),
    ...(categoryId !== undefined ? { category: { connect: { id: categoryId } } } : {}),
    ...(supplierId !== undefined ? { supplier: { connect: { id: supplierId } } } : {}),
    ...(row.inventoryUnit !== undefined ? { inventoryUnit: row.inventoryUnit } : {}),
    ...(row.sellingUnit !== undefined ? { sellingUnit: row.sellingUnit } : {}),
    ...(row.unitRatioToBase !== undefined ? { unitRatioToBase: row.unitRatioToBase } : {}),
    ...(row.packageSize !== undefined ? { packageSize: row.packageSize } : {}),
    ...(row.costPrice !== undefined ? { costPrice: row.costPrice } : {}),
    ...(row.retailPrice !== undefined ? { retailPrice: row.retailPrice } : {}),
    ...(row.wholesalePrice !== undefined ? { wholesalePrice: row.wholesalePrice } : {}),
    ...(row.vipPrice !== undefined ? { vipPrice: row.vipPrice } : {}),
    ...(row.minimumStock !== undefined ? { minimumStock: row.minimumStock } : {}),
    ...(row.taxRate !== undefined ? { taxRate: row.taxRate } : {}),
    ...(row.status !== undefined ? { status: row.status } : {}),
    ...(row.expiresAt !== undefined ? { expiresAt: row.expiresAt } : {}),
    ...(row.batchNumber !== undefined ? { batchNumber: row.batchNumber } : {}),
    ...(row.location !== undefined ? { location: row.location } : {}),
    ...(row.notes !== undefined ? { notes: row.notes } : {})
  };
}

async function updateImportedProduct(transaction: Transaction, productId: string, row: NormalizedImportRow, expectedUpdatedAt: string, actorId: string) {
  const existing = await transaction.product.findFirst({ where: { id: productId, deletedAt: null }, include: { barcodes: true } });
  if (!existing) throw new AppError(409, "IMPORT_PRODUCT_CHANGED", `Row ${row.rowNumber}: the matched product no longer exists.`);
  if (existing.updatedAt.toISOString() !== expectedUpdatedAt) {
    throw new AppError(409, "IMPORT_PRODUCT_CHANGED", `Row ${row.rowNumber}: the matched product changed after preview. Preview the file again.`);
  }

  const previous = snapshotProduct(existing);
  const categoryId = await resolveCategoryId(transaction, row.category);
  const supplierId = await resolveSupplierId(transaction, row.supplier);
  const priceChanges = findPriceChanges(
    {
      costPrice: Number(existing.costPrice),
      retailPrice: Number(existing.retailPrice),
      wholesalePrice: Number(existing.wholesalePrice),
      vipPrice: Number(existing.vipPrice)
    },
    row
  );
  const barcodeExists = row.barcode ? existing.barcodes.some((barcode) => barcode.value.toLocaleLowerCase() === row.barcode?.toLocaleLowerCase()) : true;
  const updated = await transaction.product.update({
    where: { id: productId },
    data: {
      ...productUpdateData(row, categoryId, supplierId),
      ...(!barcodeExists && row.barcode ? { barcodes: { create: [{ value: row.barcode, isPrimary: existing.barcodes.length === 0 }] } } : {})
    },
    include: { barcodes: true }
  });

  if (priceChanges.length > 0) {
    await transaction.priceHistory.createMany({
      data: priceChanges.map((change) => ({ productId, changedById: actorId, ...change }))
    });
  }
  await transaction.auditLog.create({
    data: {
      actorId,
      action: "PRODUCT_UPDATED_BY_IMPORT",
      entityType: "Product",
      entityId: productId,
      metadata: { changedFields: Object.keys(row.raw), priceChanges }
    }
  });
  return { previous, product: updated };
}

function movementType(mode: InventoryImportMode, action: ImportPreviewRow["action"]) {
  if (mode === "ADD_STOCK") return "STOCK_ADDITION";
  if (mode === "REPLACE_STOCK" || mode === "ADJUST_STOCK") return "STOCK_ADJUSTMENT";
  if (mode === "INITIAL_INVENTORY") return "INITIAL_INVENTORY";
  return action === "CREATE" ? "STOCK_IMPORT" : "STOCK_ADJUSTMENT";
}

export async function writeImportRow(
  transaction: Transaction,
  options: {
    batchId: string;
    mode: InventoryImportMode;
    row: ImportPreviewRow;
    warehouseId: string;
    warehouseIds: string[];
    actorId: string;
  }
) {
  const { row } = options;
  let product: ProductWithBarcodes;
  let previousProduct: ProductImportSnapshot | null = null;

  if (row.action === "CREATE") {
    product = await createImportedProduct(transaction, row.normalized, options.warehouseIds, options.actorId);
  } else {
    const productId = row.matchedProduct?.id;
    if (!productId || !row.matchedProduct) throw new AppError(409, "IMPORT_MATCH_REQUIRED", `Row ${row.rowNumber}: an existing product match is required.`);
    if (row.action === "UPDATE") {
      const updated = await updateImportedProduct(transaction, productId, row.normalized, row.matchedProduct.updatedAt, options.actorId);
      previousProduct = updated.previous;
      product = updated.product;
    } else {
      const current = await transaction.product.findFirst({ where: { id: productId, deletedAt: null }, include: { barcodes: true } });
      if (!current) throw new AppError(409, "IMPORT_PRODUCT_CHANGED", `Row ${row.rowNumber}: the matched product no longer exists.`);
      if (current.updatedAt.toISOString() !== row.matchedProduct.updatedAt) {
        throw new AppError(409, "IMPORT_PRODUCT_CHANGED", `Row ${row.rowNumber}: the matched product changed after preview. Preview the file again.`);
      }
      product = current;
    }
  }

  const stock = await transaction.inventoryStock.upsert({
    where: { productId_warehouseId: { productId: product.id, warehouseId: options.warehouseId } },
    update: {},
    create: { productId: product.id, warehouseId: options.warehouseId, quantity: 0 }
  });
  const previousStock = Number(stock.quantity);
  if (row.action !== "CREATE" && row.previousStock !== undefined && previousStock !== row.previousStock) {
    throw new AppError(409, "IMPORT_STOCK_CHANGED", `Row ${row.rowNumber}: stock changed after preview. Preview the file again.`);
  }
  const newStock = previousStock + row.stockDelta;
  if (newStock < 0) throw new AppError(409, "INSUFFICIENT_STOCK", `Row ${row.rowNumber}: the import would make stock negative.`);

  let inventoryMovementId: string | undefined;
  if (row.stockDelta !== 0) {
    await transaction.inventoryStock.update({ where: { id: stock.id }, data: { quantity: newStock } });
    const movement = await transaction.inventoryMovement.create({
      data: {
        productId: product.id,
        warehouseId: options.warehouseId,
        type: movementType(options.mode, row.action),
        quantity: row.stockDelta,
        unitCost: row.normalized.costPrice ?? Number(product.costPrice),
        referenceType: "INVENTORY_IMPORT",
        referenceId: options.batchId,
        reason: `Inventory import row ${row.rowNumber}`,
        createdByUserId: options.actorId
      }
    });
    inventoryMovementId = movement.id;
    await transaction.auditLog.create({
      data: {
        actorId: options.actorId,
        action: "INVENTORY_IMPORTED",
        entityType: "InventoryMovement",
        entityId: movement.id,
        metadata: { batchId: options.batchId, rowNumber: row.rowNumber, productId: product.id, previousStock, newStock, quantityChanged: row.stockDelta }
      }
    });
  }

  const newProduct = snapshotProduct(product);
  return transaction.inventoryImportRow.create({
    data: {
      batchId: options.batchId,
      rowNumber: row.rowNumber,
      productId: product.id,
      inventoryMovementId,
      action: row.action,
      status: "SUCCESS",
      matchMethod: row.matchMethod,
      previousProduct: previousProduct ? jsonValue(previousProduct) : undefined,
      newProduct: jsonValue(newProduct),
      previousStock,
      newStock,
      quantityChanged: row.stockDelta,
      warnings: jsonValue(row.warnings),
      errors: jsonValue([])
    }
  });
}

export function restoreProductData(snapshot: ProductImportSnapshot): Prisma.ProductUpdateInput {
  return {
    sku: snapshot.sku,
    name: snapshot.name,
    variant: snapshot.variant,
    salesChannel: snapshot.salesChannel,
    description: snapshot.description,
    imageUrl: snapshot.imageUrl,
    brand: snapshot.brand,
    category: snapshot.categoryId ? { connect: { id: snapshot.categoryId } } : { disconnect: true },
    supplier: snapshot.supplierId ? { connect: { id: snapshot.supplierId } } : { disconnect: true },
    inventoryUnit: snapshot.inventoryUnit,
    sellingUnit: snapshot.sellingUnit,
    unitRatioToBase: snapshot.unitRatioToBase,
    packageSize: snapshot.packageSize,
    costPrice: snapshot.costPrice,
    retailPrice: snapshot.retailPrice,
    wholesalePrice: snapshot.wholesalePrice,
    vipPrice: snapshot.vipPrice,
    wholesaleThreshold: snapshot.wholesaleThreshold,
    taxRate: snapshot.taxRate,
    minimumStock: snapshot.minimumStock,
    maximumStock: snapshot.maximumStock,
    status: snapshot.status,
    expiresAt: snapshot.expiresAt ? new Date(snapshot.expiresAt) : null,
    batchNumber: snapshot.batchNumber,
    location: snapshot.location,
    notes: snapshot.notes,
    deletedAt: snapshot.deletedAt ? new Date(snapshot.deletedAt) : null,
    barcodes: { deleteMany: {}, create: snapshot.barcodes }
  };
}
