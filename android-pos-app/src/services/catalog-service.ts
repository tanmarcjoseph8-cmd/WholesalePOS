import type { LocalDatabase } from "../data/database";
import { createId, createUuid, nowIso, type LocalUser, type ProductInput, type ProductRecord, type UnitCode } from "../domain/models";
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
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const productSelect = `
SELECT p.id, p.sku, b.value AS barcode, p.name, p.category_id, c.name AS category_name,
  p.inventory_unit, p.selling_unit, p.unit_ratio_micro, p.package_size_micro,
  p.cost_price_cents, p.retail_price_cents, p.wholesale_price_cents,
  p.wholesale_threshold_micro, p.tax_basis_points, p.minimum_stock_micro, p.status,
  COALESCE(SUM(ai.physical_micro), 0) AS stock_micro,
  COALESCE(SUM(ai.reserved_micro), 0) AS reserved_micro,
  COALESCE(SUM(ai.available_micro), 0) AS available_micro,
  p.created_at, p.updated_at
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN product_barcodes b ON b.product_id = p.id AND b.is_primary = 1
LEFT JOIN available_inventory ai ON ai.product_id = p.id`;

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

  async listProducts(search = "", includeInactive = false) {
    const term = `%${search.trim()}%`;
    const rows = await this.db.query<ProductRow>(
      `${productSelect}
       WHERE p.deleted_at IS NULL AND (? = 1 OR p.status = 'ACTIVE')
         AND (? = '%%' OR p.name LIKE ? COLLATE NOCASE OR p.sku LIKE ? COLLATE NOCASE OR b.value LIKE ? COLLATE NOCASE)
       GROUP BY p.id, b.value, c.name ORDER BY p.name LIMIT 2000`,
      [includeInactive ? 1 : 0, term, term, term, term]
    );
    return rows.map(mapProduct);
  }

  async getProduct(id: string) {
    const rows = await this.db.query<ProductRow>(`${productSelect} WHERE p.id = ? AND p.deleted_at IS NULL GROUP BY p.id, b.value, c.name`, [id]);
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
        await this.db.run("INSERT INTO product_barcodes(id, product_id, value, is_primary, created_at) VALUES (?, ?, ?, 1, ?)", [createId("barcode"), id, input.barcode.trim(), now], false);
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
