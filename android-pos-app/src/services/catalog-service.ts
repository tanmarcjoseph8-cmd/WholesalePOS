import type { LocalDatabase } from "../data/database";
import { createId, createUuid, nowIso, type LocalUser, type PageResult, type ProductInput, type ProductRecord, type UnitCode } from "../domain/models";
import { audit } from "./service-helpers";

type ProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category_id: string | null;
  category_name: string | null;
  inventory_unit: UnitCode;
  selling_unit: UnitCode;
  unit_ratio_micro: number;
  package_size_micro: number;
  cost_price_cents: number;
  retail_price_cents: number;
  wholesale_price_cents: number;
  wholesale_threshold_micro: number;
  tax_basis_points: number;
  minimum_stock_micro: number;
  status: "ACTIVE" | "INACTIVE";
  stock_micro: number;
  reserved_micro: number;
  available_micro: number;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
};

function mapProduct(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    inventoryUnit: row.inventory_unit,
    sellingUnit: row.selling_unit,
    unitRatioMicro: Number(row.unit_ratio_micro),
    packageSizeMicro: Number(row.package_size_micro),
    costPriceCents: Number(row.cost_price_cents),
    retailPriceCents: Number(row.retail_price_cents),
    wholesalePriceCents: Number(row.wholesale_price_cents),
    wholesaleThresholdMicro: Number(row.wholesale_threshold_micro),
    taxBasisPoints: Number(row.tax_basis_points),
    minimumStockMicro: Number(row.minimum_stock_micro),
    status: row.status,
    stockMicro: Number(row.stock_micro),
    reservedMicro: Number(row.reserved_micro),
    availableMicro: Number(row.available_micro),
    thumbnailPath: row.thumbnail_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const productSelect = `
SELECT p.id, p.sku,
  (SELECT value FROM product_barcodes WHERE product_id=p.id AND is_primary=1 ORDER BY created_at LIMIT 1) AS barcode,
  p.name, p.category_id, c.name AS category_name,
  p.inventory_unit, p.selling_unit, p.unit_ratio_micro, p.package_size_micro,
  p.cost_price_cents, p.retail_price_cents, p.wholesale_price_cents,
  p.wholesale_threshold_micro, p.tax_basis_points, p.minimum_stock_micro, p.status,
  COALESCE(s.quantity_micro, 0) AS stock_micro,
  COALESCE((SELECT SUM(r.quantity_micro) FROM inventory_reservations r
    WHERE r.product_id=p.id AND r.warehouse_id='warehouse_main' AND r.status='ACTIVE'), 0) AS reserved_micro,
  COALESCE(s.quantity_micro, 0) - COALESCE((SELECT SUM(r.quantity_micro) FROM inventory_reservations r
    WHERE r.product_id=p.id AND r.warehouse_id='warehouse_main' AND r.status='ACTIVE'), 0) AS available_micro,
  (SELECT thumbnail_path FROM product_images WHERE product_id=p.id AND is_primary=1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1) AS thumbnail_path,
  p.created_at, p.updated_at
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN inventory_stock s ON s.product_id=p.id AND s.warehouse_id='warehouse_main'`;

export type ProductPageQuery = {
  search?: string;
  categoryId?: string | null;
  includeInactive?: boolean;
  status?: "ACTIVE" | "INACTIVE" | "ALL";
  pageSize?: number;
  cursor?: string | null;
};

function encodeCursor(product: ProductRecord) {
  return encodeURIComponent(JSON.stringify([product.name, product.id]));
}

function decodeCursor(cursor: string | null | undefined) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(decodeURIComponent(cursor)) as unknown;
    return Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "string" ? { name: value[0], id: value[1] } : null;
  } catch {
    return null;
  }
}

/** Normalizes scanner input consistently before exact indexed lookup. */
export function normalizeBarcode(value: string) {
  return value.trim();
}

export class CatalogService {
  constructor(private db: LocalDatabase) {}

  async listCategories() {
    return this.db.query<{ id: string; name: string }>("SELECT id, name FROM categories WHERE deleted_at IS NULL ORDER BY name");
  }

  async saveCategory(actor: LocalUser, name: string) {
    if (!actor.permissions.includes("*") && !actor.permissions.includes("products.manage")) throw new Error("Product management permission is required.");
    if (name.trim().length < 2) throw new Error("Category name must contain at least two characters.");
    const id = createId("category");
    const now = nowIso();
    await this.db.transaction(async () => {
      await this.db.run("INSERT INTO categories(id, name, created_at, updated_at) VALUES (?, ?, ?, ?)", [id, name.trim(), now, now], false);
      await audit(this.db, { actorId: actor.id, action: "CATEGORY_CREATED", entityType: "Category", entityId: id, metadata: { name: name.trim() } });
    });
    return id;
  }

  /** Returns one stable, bounded catalog page using database filtering and keyset pagination. */
  async listProductPage(query: ProductPageQuery = {}): Promise<PageResult<ProductRecord>> {
    const search = query.search?.trim() ?? "";
    const prefix = `${search}%`;
    const pageSize = Math.min(Math.max(Math.trunc(query.pageSize ?? 60), 10), 200);
    const cursor = decodeCursor(query.cursor);
    const where = ["p.deleted_at IS NULL"];
    const values: Array<string | number | null> = [];
    const status = query.status ?? (query.includeInactive ? "ALL" : "ACTIVE");
    if (status !== "ALL") { where.push("p.status=?"); values.push(status); }
    if (query.categoryId) { where.push("p.category_id=?"); values.push(query.categoryId); }
    if (search) {
      where.push(`(p.sku=? COLLATE NOCASE
        OR EXISTS(SELECT 1 FROM product_barcodes bx WHERE bx.product_id=p.id AND bx.value=? COLLATE NOCASE)
        OR p.name=? COLLATE NOCASE OR p.name LIKE ? COLLATE NOCASE OR p.sku LIKE ? COLLATE NOCASE
        OR EXISTS(SELECT 1 FROM product_barcodes bp WHERE bp.product_id=p.id AND bp.value LIKE ? COLLATE NOCASE))`);
      values.push(search, normalizeBarcode(search), search, prefix, prefix, prefix);
    }
    if (cursor) {
      where.push("(p.name > ? COLLATE NOCASE OR (p.name = ? COLLATE NOCASE AND p.id > ?))");
      values.push(cursor.name, cursor.name, cursor.id);
    }
    const rows = await this.db.query<ProductRow>(
      `${productSelect} WHERE ${where.join(" AND ")} ORDER BY p.name COLLATE NOCASE, p.id LIMIT ?`,
      [...values, pageSize + 1]
    );
    const mapped = rows.map(mapProduct);
    const items = mapped.slice(0, pageSize);
    return { items, nextCursor: mapped.length > pageSize && items.length ? encodeCursor(items[items.length - 1]!) : null };
  }

  /** Backward-compatible bounded search used by older callers during migration. */
  async listProducts(search = "", includeInactive = false) {
    return (await this.listProductPage({ search, includeInactive, pageSize: 100 })).items;
  }

  /** Performs an exact unique-barcode lookup without wildcard scans or image loading. */
  async findByBarcode(barcode: string) {
    const normalized = normalizeBarcode(barcode);
    if (!normalized) return null;
    const rows = await this.db.query<ProductRow>(
      `${productSelect} JOIN product_barcodes exact_barcode ON exact_barcode.product_id=p.id
       WHERE exact_barcode.value=? COLLATE NOCASE AND p.status='ACTIVE' AND p.deleted_at IS NULL LIMIT 1`,
      [normalized]
    );
    return rows[0] ? mapProduct(rows[0]) : null;
  }

  async getProduct(id: string) {
    const rows = await this.db.query<ProductRow>(`${productSelect} WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) throw new Error("Product was not found.");
    return mapProduct(row);
  }

  async saveProduct(actor: LocalUser, input: ProductInput) {
    if (!actor.permissions.includes("*") && !actor.permissions.includes("products.manage")) throw new Error("Product management permission is required.");
    if (!input.name.trim()) throw new Error("Product name is required.");
    const nonNegativeIntegers = [input.costPriceCents, input.retailPriceCents, input.wholesalePriceCents, input.wholesaleThresholdMicro, input.minimumStockMicro, input.taxBasisPoints];
    if (nonNegativeIntegers.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("Prices, tax, and stock thresholds must be valid non-negative values.");
    if (!Number.isSafeInteger(input.unitRatioMicro) || input.unitRatioMicro <= 0 || !Number.isSafeInteger(input.packageSizeMicro) || input.packageSizeMicro <= 0) throw new Error("Unit conversion and package size must be greater than zero.");
    if (input.taxBasisPoints > 10_000) throw new Error("Tax cannot exceed 100 percent.");
    const id = input.id ?? createId("product");
    const now = nowIso();
    const sku = input.sku.trim() || input.barcode?.trim() || `AUTO-${createUuid().slice(0, 8).toUpperCase()}`;
    await this.db.transaction(async () => {
      if (input.id) {
        await this.db.run(
          `UPDATE products SET category_id=?, sku=?, name=?, inventory_unit=?, selling_unit=?, unit_ratio_micro=?, package_size_micro=?,
           cost_price_cents=?, retail_price_cents=?, wholesale_price_cents=?, wholesale_threshold_micro=?, tax_basis_points=?, minimum_stock_micro=?, status=?, updated_at=?
           WHERE id=? AND deleted_at IS NULL`,
          [input.categoryId, sku, input.name.trim(), input.inventoryUnit, input.sellingUnit, input.unitRatioMicro, input.packageSizeMicro, input.costPriceCents, input.retailPriceCents, input.wholesalePriceCents, input.wholesaleThresholdMicro, input.taxBasisPoints, input.minimumStockMicro, input.status, now, id],
          false
        );
        await this.db.run("DELETE FROM product_barcodes WHERE product_id = ?", [id], false);
      } else {
        await this.db.run(
          `INSERT INTO products(id, category_id, sku, name, inventory_unit, selling_unit, unit_ratio_micro, package_size_micro,
           cost_price_cents, retail_price_cents, wholesale_price_cents, wholesale_threshold_micro, tax_basis_points, minimum_stock_micro, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, input.categoryId, sku, input.name.trim(), input.inventoryUnit, input.sellingUnit, input.unitRatioMicro, input.packageSizeMicro, input.costPriceCents, input.retailPriceCents, input.wholesalePriceCents, input.wholesaleThresholdMicro, input.taxBasisPoints, input.minimumStockMicro, input.status, now, now],
          false
        );
        await this.db.run("INSERT OR IGNORE INTO inventory_stock(product_id, warehouse_id, quantity_micro, updated_at) VALUES (?, 'warehouse_main', 0, ?)", [id, now], false);
      }
      if (input.barcode?.trim()) {
        await this.db.run("INSERT INTO product_barcodes(id, product_id, value, is_primary, created_at) VALUES (?, ?, ?, 1, ?)", [createId("barcode"), id, normalizeBarcode(input.barcode), now], false);
      }
      await audit(this.db, { actorId: actor.id, action: input.id ? "PRODUCT_UPDATED" : "PRODUCT_CREATED", entityType: "Product", entityId: id, metadata: { sku, name: input.name.trim() } });
    });
    return this.getProduct(id);
  }

  async deactivateProduct(actor: LocalUser, id: string, reason: string) {
    if (!actor.permissions.includes("*") && !actor.permissions.includes("products.manage")) throw new Error("Product management permission is required.");
    if (reason.trim().length < 3) throw new Error("A reason is required.");
    await this.db.transaction(async () => {
      await this.db.run("UPDATE products SET status='INACTIVE', deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL", [nowIso(), nowIso(), id], false);
      await audit(this.db, { actorId: actor.id, action: "PRODUCT_DEACTIVATED", entityType: "Product", entityId: id, reason });
    });
  }
}
