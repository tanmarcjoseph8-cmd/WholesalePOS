import type { LocalDatabase } from "../data/database";
import { createId, nowIso, type LocalUser } from "../domain/models";
import { audit } from "./service-helpers";

export type PriceRuleInput = {
  id?: string;
  productId: string;
  priceLevelId: string;
  priceCents: number;
  minimumQuantityMicro: number;
  effectiveAt: string;
  expiresAt?: string | null;
  active: boolean;
};

export type ProductPriceRule = {
  id: string;
  priceLevelId: string;
  levelCode: string;
  levelName: string;
  priceCents: number;
  minimumQuantityMicro: number;
  effectiveAt: string;
  expiresAt: string | null;
  active: boolean;
};

/** Resolves extensible price levels while retaining legacy retail and wholesale fallbacks. */
export class PricingService {
  constructor(private readonly db: LocalDatabase) {}

  async listLevels() {
    return this.db.query<{ id: string; code: string; name: string; priority: number }>("SELECT id, code, name, priority FROM price_levels WHERE is_active=1 ORDER BY priority, name");
  }

  async listRules(productId: string) {
    const rows = await this.db.query<{
      id: string; price_level_id: string; level_code: string; level_name: string; price_cents: number;
      minimum_quantity_micro: number; effective_at: string; expires_at: string | null; is_active: number;
    }>(
      `SELECT pp.id, pp.price_level_id, pl.code AS level_code, pl.name AS level_name, pp.price_cents,
              pp.minimum_quantity_micro, pp.effective_at, pp.expires_at, pp.is_active
       FROM product_prices pp JOIN price_levels pl ON pl.id=pp.price_level_id
       WHERE pp.product_id=? AND pp.deleted_at IS NULL
       ORDER BY pl.priority, pp.minimum_quantity_micro, pp.effective_at DESC`,
      [productId]
    );
    return rows.map<ProductPriceRule>((row) => ({
      id: row.id,
      priceLevelId: row.price_level_id,
      levelCode: row.level_code,
      levelName: row.level_name,
      priceCents: Number(row.price_cents),
      minimumQuantityMicro: Number(row.minimum_quantity_micro),
      effectiveAt: row.effective_at,
      expiresAt: row.expires_at,
      active: Boolean(row.is_active)
    }));
  }

  /** Returns the best active quantity/effective-date rule, then the existing product price. */
  async resolve(productId: string, levelCode: string, quantityMicro: number, at = nowIso()) {
    const rules = await this.db.query<{ price_cents: number }>(
      `SELECT pp.price_cents FROM product_prices pp JOIN price_levels pl ON pl.id=pp.price_level_id
       WHERE pp.product_id=? AND pl.code=? COLLATE NOCASE AND pp.is_active=1 AND pl.is_active=1
         AND pp.deleted_at IS NULL AND pp.minimum_quantity_micro<=? AND pp.effective_at<=?
         AND (pp.expires_at IS NULL OR pp.expires_at>?)
       ORDER BY pp.minimum_quantity_micro DESC, pp.effective_at DESC LIMIT 1`,
      [productId, levelCode, quantityMicro, at, at]
    );
    if (rules[0]) return Number(rules[0].price_cents);
    const product = await this.db.query<{ retail_price_cents: number; wholesale_price_cents: number; wholesale_threshold_micro: number }>("SELECT retail_price_cents, wholesale_price_cents, wholesale_threshold_micro FROM products WHERE id=? AND deleted_at IS NULL", [productId]);
    if (!product[0]) throw new Error("Product was not found.");
    if (levelCode.toUpperCase() === "WHOLESALE" || (levelCode.toUpperCase() === "AUTO" && product[0].wholesale_threshold_micro > 0 && quantityMicro >= product[0].wholesale_threshold_micro)) return Number(product[0].wholesale_price_cents);
    return Number(product[0].retail_price_cents);
  }

  /** Saves a non-overwriting effective-dated rule; completed sale rows remain unchanged. */
  async saveRule(actor: LocalUser, input: PriceRuleInput) {
    if (!actor.permissions.includes("*") && !actor.permissions.includes("products.manage")) throw new Error("Product management permission is required.");
    if (!Number.isSafeInteger(input.priceCents) || input.priceCents < 0 || !Number.isSafeInteger(input.minimumQuantityMicro) || input.minimumQuantityMicro < 0) throw new Error("Price and minimum quantity must be valid non-negative values.");
    if (!Number.isFinite(Date.parse(input.effectiveAt)) || (input.expiresAt && Date.parse(input.expiresAt) <= Date.parse(input.effectiveAt))) throw new Error("Price rule dates are invalid.");
    const id = input.id ?? createId("price");
    const now = nowIso();
    await this.db.transaction(async () => {
      if (input.id) await this.db.run("UPDATE product_prices SET price_level_id=?, price_cents=?, minimum_quantity_micro=?, effective_at=?, expires_at=?, is_active=?, updated_at=? WHERE id=? AND deleted_at IS NULL", [input.priceLevelId, input.priceCents, input.minimumQuantityMicro, input.effectiveAt, input.expiresAt ?? null, input.active ? 1 : 0, now, id], false);
      else await this.db.run("INSERT INTO product_prices(id, product_id, price_level_id, price_cents, minimum_quantity_micro, effective_at, expires_at, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [id, input.productId, input.priceLevelId, input.priceCents, input.minimumQuantityMicro, input.effectiveAt, input.expiresAt ?? null, input.active ? 1 : 0, now, now], false);
      await audit(this.db, { actorId: actor.id, action: input.id ? "PRICE_RULE_UPDATED" : "PRICE_RULE_CREATED", entityType: "ProductPrice", entityId: id, metadata: { productId: input.productId, priceLevelId: input.priceLevelId, priceCents: input.priceCents } });
    });
    return id;
  }
}
