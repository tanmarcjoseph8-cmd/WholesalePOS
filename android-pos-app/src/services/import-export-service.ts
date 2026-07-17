import type { LocalDatabase } from "../data/database";
import { createId, inventoryUnits, nowIso, QUANTITY_SCALE, type LocalUser, type UnitCode } from "../domain/models";
import { fileService, type FileService } from "../platform/file-service";
import { audit, placeholders } from "./service-helpers";
import type { SettingsReportService } from "./settings-report-service";

export type ImportRow = {
  rowNumber: number;
  sku: string;
  barcode: string | null;
  name: string;
  inventoryUnit: UnitCode;
  sellingUnit: UnitCode;
  costPriceCents: number;
  retailPriceCents: number;
  wholesalePriceCents: number;
  startingStockMicro: number;
  minimumStockMicro: number;
  errors: string[];
};

export type ImportPreview = {
  sourceName: string;
  fingerprint: string;
  rows: ImportRow[];
  validCount: number;
  invalidCount: number;
};

export type ImportProgress = { processed: number; total: number; created: number; updated: number; skipped: number };

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const parsed = Number(String(value ?? "0").replace(/[\u20b1,$ ]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

async function fingerprint(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeHeaders(row: Record<string, unknown>) {
  return Object.entries(row).reduce<Record<string, unknown>>((normalized, [key, value]) => {
    normalized[key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")] = value;
    return normalized;
  }, {});
}

export class ImportExportService {
  constructor(private db: LocalDatabase, private reports: SettingsReportService, private files: FileService = fileService) {}

  async pickAndPreviewProducts() {
    const XLSX = await import("xlsx");
    const file = await this.files.pickFile([
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ]);
    const workbook = XLSX.read(file.bytes, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) throw new Error("The selected workbook has no readable worksheet.");
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (rawRows.length > 100_000) throw new Error("Import files are limited to 100,000 product rows per batch.");
    const rows = rawRows.map((raw, index): ImportRow => {
      const source = normalizeHeaders(raw);
      const name = text(source.name ?? source.product_name);
      const sku = text(source.sku);
      const barcode = text(source.barcode) || null;
      const inventoryUnit = (text(source.inventory_unit ?? source.unit) || "PIECE").toUpperCase() as UnitCode;
      const sellingUnit = (text(source.selling_unit) || inventoryUnit).toUpperCase() as UnitCode;
      const cost = number(source.cost_price ?? source.cost);
      const retail = number(source.retail_price ?? source.price);
      const wholesale = number(source.wholesale_price ?? source.wholesale ?? retail);
      const stock = number(source.starting_stock ?? source.stock ?? 0);
      const minimum = number(source.minimum_stock ?? source.low_stock_threshold ?? 0);
      const errors: string[] = [];
      if (!name) errors.push("Name is required.");
      if (!sku && !barcode) errors.push("SKU or barcode is required for file imports.");
      if (!(inventoryUnits as readonly string[]).includes(inventoryUnit) || !(inventoryUnits as readonly string[]).includes(sellingUnit)) errors.push("Inventory and selling units must use a supported unit name.");
      if ([cost, retail, wholesale, stock, minimum].some((entry) => !Number.isFinite(entry) || entry < 0)) errors.push("Prices and quantities must be valid non-negative numbers.");
      return {
        rowNumber: index + 2,
        sku: sku || barcode || "",
        barcode,
        name,
        inventoryUnit,
        sellingUnit,
        costPriceCents: Math.round(cost * 100),
        retailPriceCents: Math.round(retail * 100),
        wholesalePriceCents: Math.round(wholesale * 100),
        startingStockMicro: Math.round(stock * QUANTITY_SCALE),
        minimumStockMicro: Math.round(minimum * QUANTITY_SCALE),
        errors
      };
    });
    const seenSku = new Map<string, number>();
    const seenBarcode = new Map<string, number>();
    for (const row of rows) {
      const skuKey = row.sku.toLocaleLowerCase();
      const barcodeKey = row.barcode?.toLocaleLowerCase() ?? "";
      if (skuKey && seenSku.has(skuKey)) row.errors.push(`Duplicate SKU also appears on row ${seenSku.get(skuKey)}.`);
      else if (skuKey) seenSku.set(skuKey, row.rowNumber);
      if (barcodeKey && seenBarcode.has(barcodeKey)) row.errors.push(`Duplicate barcode also appears on row ${seenBarcode.get(barcodeKey)}.`);
      else if (barcodeKey) seenBarcode.set(barcodeKey, row.rowNumber);
    }
    return { sourceName: file.name, fingerprint: await fingerprint(file.bytes), rows, validCount: rows.filter((row) => !row.errors.length).length, invalidCount: rows.filter((row) => row.errors.length).length } satisfies ImportPreview;
  }

  /** Imports a prevalidated catalog in native batches while preserving all-or-nothing product and stock writes. */
  async executeProductImport(actor: LocalUser, preview: ImportPreview, duplicateAction: "SKIP" | "UPDATE", options: { onProgress?: (progress: ImportProgress) => void; signal?: AbortSignal } = {}) {
    if (preview.invalidCount) throw new Error("Correct or remove invalid rows before importing.");
    if (preview.rows.length > 100_000) throw new Error("Imports cannot exceed 100,000 product rows.");
    const previous = await this.db.query<{ id: string }>("SELECT id FROM import_batches WHERE source_fingerprint=? AND status='COMPLETED'", [preview.fingerprint]);
    if (previous[0]) throw new Error("This exact file was already imported.");
    const batchId = createId("import");
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const startedAt = nowIso();
    await this.db.run("INSERT INTO import_batches(id, request_key, source_name, source_fingerprint, status, row_count, actor_id, created_at) VALUES (?, ?, ?, ?, 'PROCESSING', ?, ?, ?)", [batchId, createId("importrequest"), preview.sourceName, preview.fingerprint, preview.rows.length, actor.id, startedAt]);
    try {
      await this.db.transaction(async () => {
        const chunkSize = 250;
        for (let offset = 0; offset < preview.rows.length; offset += chunkSize) {
          if (options.signal?.aborted) throw new Error("Import cancelled. No product changes were saved.");
          const rows = preview.rows.slice(offset, offset + chunkSize);
          const skuValues = rows.map((row) => row.sku);
          const barcodeValues = rows.map((row) => row.barcode).filter((value): value is string => Boolean(value));
          const existingSkuRows = skuValues.length ? await this.db.query<{ id: string; sku: string }>(`SELECT id, sku FROM products WHERE deleted_at IS NULL AND sku IN (${placeholders(skuValues)})`, skuValues) : [];
          const existingBarcodeRows = barcodeValues.length ? await this.db.query<{ product_id: string; value: string }>(`SELECT product_id, value FROM product_barcodes WHERE value IN (${placeholders(barcodeValues)})`, barcodeValues) : [];
          const bySku = new Map(existingSkuRows.map((entry) => [entry.sku.toLocaleLowerCase(), entry.id]));
          const byBarcode = new Map(existingBarcodeRows.map((entry) => [entry.value.toLocaleLowerCase(), entry.product_id]));
          const statements: Array<{ statement: string; values: Array<string | number | null> }> = [];
          const now = nowIso();
          for (const row of rows) {
            const skuMatch = bySku.get(row.sku.toLocaleLowerCase());
            const barcodeMatch = row.barcode ? byBarcode.get(row.barcode.toLocaleLowerCase()) : undefined;
            if (skuMatch && barcodeMatch && skuMatch !== barcodeMatch) throw new Error(`Row ${row.rowNumber} matches different products by SKU and barcode.`);
            const existingId = skuMatch ?? barcodeMatch;
            if (existingId && duplicateAction === "SKIP") { skipped += 1; continue; }
            const productId = existingId ?? createId("product");
            if (existingId) {
              statements.push({ statement: `UPDATE products SET name=?, inventory_unit=?, selling_unit=?, cost_price_cents=?, retail_price_cents=?, wholesale_price_cents=?, minimum_stock_micro=?, status='ACTIVE', updated_at=? WHERE id=?`, values: [row.name, row.inventoryUnit, row.sellingUnit, row.costPriceCents, row.retailPriceCents, row.wholesalePriceCents, row.minimumStockMicro, now, productId] });
              if (row.barcode) {
                statements.push({ statement: "DELETE FROM product_barcodes WHERE product_id=? AND is_primary=1", values: [productId] });
                statements.push({ statement: "INSERT INTO product_barcodes(id, product_id, value, is_primary, created_at) VALUES (?, ?, ?, 1, ?)", values: [createId("barcode"), productId, row.barcode, now] });
              }
              updated += 1;
            } else {
              statements.push({ statement: `INSERT INTO products(id, sku, name, inventory_unit, selling_unit, cost_price_cents, retail_price_cents, wholesale_price_cents, minimum_stock_micro, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values: [productId, row.sku, row.name, row.inventoryUnit, row.sellingUnit, row.costPriceCents, row.retailPriceCents, row.wholesalePriceCents, row.minimumStockMicro, now, now] });
              if (row.barcode) statements.push({ statement: "INSERT INTO product_barcodes(id, product_id, value, is_primary, created_at) VALUES (?, ?, ?, 1, ?)", values: [createId("barcode"), productId, row.barcode, now] });
              created += 1;
            }
            statements.push({ statement: "INSERT INTO audit_logs(id, actor_id, action, entity_type, entity_id, reason, metadata_json, created_at) VALUES (?, ?, ?, 'Product', ?, ?, ?, ?)", values: [createId("audit"), actor.id, existingId ? "PRODUCT_UPDATED" : "PRODUCT_CREATED", productId, `Imported from ${preview.sourceName}`, JSON.stringify({ sku: row.sku, name: row.name, importBatchId: batchId }), now] });
            if (row.startingStockMicro > 0) {
              statements.push({ statement: `INSERT INTO inventory_stock(product_id, warehouse_id, quantity_micro, updated_at) VALUES (?, 'warehouse_main', ?, ?) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET quantity_micro=inventory_stock.quantity_micro+excluded.quantity_micro, updated_at=excluded.updated_at`, values: [productId, row.startingStockMicro, now] });
              statements.push({ statement: "INSERT INTO inventory_movements(id, product_id, warehouse_id, type, quantity_micro, unit_cost_cents, reference_type, reference_id, reason, actor_id, created_at) VALUES (?, ?, 'warehouse_main', 'STOCK_IN', ?, ?, 'ImportBatch', ?, ?, ?, ?)", values: [createId("movement"), productId, row.startingStockMicro, row.costPriceCents, batchId, `Imported from ${preview.sourceName}`, actor.id, now] });
            }
          }
          await this.db.executeSet(statements, false);
          options.onProgress?.({ processed: Math.min(offset + rows.length, preview.rows.length), total: preview.rows.length, created, updated, skipped });
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        const completedAt = nowIso();
        await this.db.run("UPDATE import_batches SET status='COMPLETED', created_count=?, updated_count=?, skipped_count=?, summary_json=?, completed_at=? WHERE id=?", [created, updated, skipped, JSON.stringify({ validCount: preview.validCount }), completedAt, batchId], false);
        await audit(this.db, { actorId: actor.id, action: "PRODUCT_IMPORT_COMPLETED", entityType: "ImportBatch", entityId: batchId, metadata: { sourceName: preview.sourceName, created, updated, skipped } });
      });
    } catch (error) {
      await this.db.run("UPDATE import_batches SET status=?, failed_count=?, summary_json=?, completed_at=? WHERE id=?", [options.signal?.aborted ? "CANCELLED" : "FAILED", preview.rows.length, JSON.stringify({ message: error instanceof Error ? error.message : "Import failed" }), nowIso(), batchId]);
      throw error;
    }
    return { batchId, created, updated, skipped };
  }

  private async shareCsv(fileName: string, rows: Array<Record<string, unknown>>) {
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    return this.files.saveAndShare({ fileName, data: csv, mimeType: "text/csv", dialogTitle: `Save ${fileName}` });
  }

  async exportInventory() {
    const rows = await this.reports.inventoryReport();
    return this.shareCsv(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  async exportProducts() {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT p.sku, b.value AS barcode, p.name, c.name AS category, p.inventory_unit, p.selling_unit,
        p.cost_price_cents / 100.0 AS cost_price, p.retail_price_cents / 100.0 AS retail_price,
        p.wholesale_price_cents / 100.0 AS wholesale_price, p.minimum_stock_micro / 1000000.0 AS low_stock_threshold,
        p.status FROM products p LEFT JOIN categories c ON c.id=p.category_id
        LEFT JOIN product_barcodes b ON b.product_id=p.id AND b.is_primary=1 WHERE p.deleted_at IS NULL ORDER BY p.name`
    );
    return this.shareCsv(`products-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  async exportSales(from: string, to: string) {
    const rows = await this.reports.salesReport(from, to);
    return this.shareCsv(`sales-${from}-to-${to}.csv`, rows);
  }
}
