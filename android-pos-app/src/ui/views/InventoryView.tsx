import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FileSpreadsheet, Pencil, Plus, RefreshCw, Search, Tag, Trash2, X } from "lucide-react";
import { formatMoney, formatQuantity, inventoryUnits, QUANTITY_SCALE, type ProductInput, type ProductRecord } from "../../domain/models";
import type { ImportPreview } from "../../services/import-export-service";
import { useOfflineApp } from "../app-context";

function emptyProduct(): ProductInput {
  return { sku: "", barcode: null, name: "", categoryId: null, inventoryUnit: "PIECE", sellingUnit: "PIECE", unitRatioMicro: QUANTITY_SCALE, packageSizeMicro: QUANTITY_SCALE, costPriceCents: 0, retailPriceCents: 0, wholesalePriceCents: 0, wholesaleThresholdMicro: 0, taxBasisPoints: 0, minimumStockMicro: 0, status: "ACTIVE" };
}

function productToInput(product: ProductRecord): ProductInput {
  return { id: product.id, sku: product.sku, barcode: product.barcode, name: product.name, categoryId: product.categoryId, inventoryUnit: product.inventoryUnit, sellingUnit: product.sellingUnit, unitRatioMicro: product.unitRatioMicro, packageSizeMicro: product.packageSizeMicro, costPriceCents: product.costPriceCents, retailPriceCents: product.retailPriceCents, wholesalePriceCents: product.wholesalePriceCents, wholesaleThresholdMicro: product.wholesaleThresholdMicro, taxBasisPoints: product.taxBasisPoints, minimumStockMicro: product.minimumStockMicro, status: product.status };
}

function isLowStock(product: ProductRecord, defaultThresholdMicro: number) {
  const threshold = product.minimumStockMicro > 0 ? product.minimumStockMicro : defaultThresholdMicro;
  return product.availableMicro <= 0 || (threshold > 0 && product.availableMicro <= threshold);
}

export function InventoryView() {
  const { app, user, revision, refresh, notify, inventoryFocusId, clearInventoryFocus } = useOfflineApp();
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<ProductInput | null>(null);
  const [stockProductId, setStockProductId] = useState("");
  const [stockType, setStockType] = useState<"STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT">("STOCK_IN");
  const [stockQuantity, setStockQuantity] = useState(0);
  const [stockReason, setStockReason] = useState("Stock received");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<"SKIP" | "UPDATE">("SKIP");
  const [busy, setBusy] = useState(false);
  const [defaultThresholdMicro, setDefaultThresholdMicro] = useState(0);

  useEffect(() => { void Promise.all([app.catalog.listProducts(search, true), app.catalog.listCategories(), app.settingsReports.getSettings()]).then(([items, nextCategories, settings]) => { setProducts(items); setCategories(nextCategories); setDefaultThresholdMicro(settings.defaultLowStockThresholdMicro); setStockProductId((current) => current || items[0]?.id || ""); }); }, [app, revision, search]);
  useEffect(() => {
    if (!inventoryFocusId) return;
    void app.catalog.getProduct(inventoryFocusId).then((product) => {
      setSearch("");
      setEditor(productToInput(product));
      setStockProductId(product.id);
      clearInventoryFocus();
    }).catch((caught: unknown) => notify(caught instanceof Error ? caught.message : "The inventory item could not be opened.", "error"));
  }, [app, inventoryFocusId, clearInventoryFocus, notify]);
  const selectedStockProduct = useMemo(() => products.find((product) => product.id === stockProductId), [products, stockProductId]);

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    try {
      await app.catalog.saveProduct(user, editor);
      setEditor(null);
      refresh();
      notify("Product saved.", "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Product could not be saved.", "error"); }
    finally { setBusy(false); }
  }

  async function saveStock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await app.inventory.moveStock(user, { productId: stockProductId, type: stockType, quantityMicro: Math.round(stockQuantity * QUANTITY_SCALE), reason: stockReason, unitCostCents: selectedStockProduct?.costPriceCents });
      setStockQuantity(0);
      refresh();
      notify("Stock balance updated.", "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Stock could not be updated.", "error"); }
    finally { setBusy(false); }
  }

  async function chooseImport() {
    setBusy(true);
    try { setImportPreview(await app.importExport.pickAndPreviewProducts()); }
    catch (error) { notify(error instanceof Error ? error.message : "Import file could not be read.", "error"); }
    finally { setBusy(false); }
  }

  async function executeImport() {
    if (!importPreview) return;
    setBusy(true);
    try {
      const result = await app.importExport.executeProductImport(user, importPreview, importMode);
      setImportPreview(null);
      refresh();
      notify(`Imported ${result.created} new and ${result.updated} updated products.`, "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Import failed.", "error"); }
    finally { setBusy(false); }
  }

  async function addCategory() {
    const name = window.prompt("New category name");
    if (!name) return;
    try { const id = await app.catalog.saveCategory(user, name); setCategories(await app.catalog.listCategories()); if (editor) setEditor({ ...editor, categoryId: id }); refresh(); }
    catch (error) { notify(error instanceof Error ? error.message : "Category could not be created.", "error"); }
  }

  return (
    <section className="page-stack">
      <header className="page-header"><div><h2>Inventory</h2><p>Products, physical stock, reservations, and permanent movement history.</p></div><div className="header-actions"><button className="button secondary" onClick={() => void addCategory()} disabled={busy}><Tag size={18} /> Category</button><button className="button secondary" onClick={() => void chooseImport()} disabled={busy}><FileSpreadsheet size={18} /> Import</button><button className="button primary" onClick={() => setEditor(emptyProduct())}><Plus size={18} /> Product</button></div></header>
      <label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, or barcode" /></label>
      <div className="inventory-layout">
        <section className="data-panel product-list-panel">
          <div className="table-scroll"><table><thead><tr><th>Product</th><th>Physical</th><th>Reserved</th><th>Available</th><th>Price</th><th aria-label="Actions" /></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku}{product.barcode ? ` · ${product.barcode}` : ""}</small></td><td>{formatQuantity(product.stockMicro)}</td><td>{formatQuantity(product.reservedMicro)}</td><td className={isLowStock(product, defaultThresholdMicro) ? "low" : ""}>{formatQuantity(product.availableMicro)}</td><td>{formatMoney(product.retailPriceCents)}</td><td><div className="row-actions"><button aria-label={`Edit ${product.name}`} onClick={() => setEditor(productToInput(product))}><Pencil size={17} /></button><button className="icon-danger" aria-label={`Deactivate ${product.name}`} onClick={() => { const reason = window.prompt(`Reason for deactivating ${product.name}`); if (reason) void app.catalog.deactivateProduct(user, product.id, reason).then(refresh).catch((error: unknown) => notify(error instanceof Error ? error.message : "Unable to deactivate product.", "error")); }}><Trash2 size={17} /></button></div></td></tr>)}</tbody></table></div>
        </section>
        <form className="data-panel stock-form" onSubmit={saveStock}><h3>Stock movement</h3><label>Product<select value={stockProductId} onChange={(event) => setStockProductId(event.target.value)}>{products.filter((product) => product.status === "ACTIVE").map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label><label>Movement<select value={stockType} onChange={(event) => setStockType(event.target.value as typeof stockType)}><option value="STOCK_IN">Add stock</option><option value="STOCK_OUT">Remove stock</option><option value="ADJUSTMENT">Set counted stock</option></select></label><label>{stockType === "ADJUSTMENT" ? "Counted quantity" : "Quantity"}<input type="number" min="0" step="any" value={stockQuantity} onChange={(event) => setStockQuantity(Number(event.target.value))} required /></label><label>Reason<input value={stockReason} onChange={(event) => setStockReason(event.target.value)} minLength={3} required /></label>{selectedStockProduct ? <p className="stock-summary">Current available: <strong>{formatQuantity(selectedStockProduct.availableMicro)} {selectedStockProduct.inventoryUnit.toLowerCase()}</strong></p> : null}<button className="button primary wide" disabled={busy || !stockProductId}><RefreshCw size={18} /> Save stock</button></form>
      </div>

      {editor ? <div className="dialog-backdrop"><form className="dialog product-dialog" onSubmit={saveProduct}><div className="dialog-title"><h2>{editor.id ? "Edit product" : "Add product"}</h2><button type="button" aria-label="Close product form" onClick={() => setEditor(null)}><X size={20} /></button></div><div className="form-grid"><label className="span-2">Product name<input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} required /></label><label>SKU optional<input value={editor.sku} onChange={(event) => setEditor({ ...editor, sku: event.target.value })} /></label><label>Barcode optional<input value={editor.barcode ?? ""} onChange={(event) => setEditor({ ...editor, barcode: event.target.value || null })} inputMode="numeric" /></label><label>Category<select value={editor.categoryId ?? ""} onChange={(event) => setEditor({ ...editor, categoryId: event.target.value || null })}><option value="">Uncategorized</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>Status<select value={editor.status} onChange={(event) => setEditor({ ...editor, status: event.target.value as ProductInput["status"] })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label><label>Inventory unit<select value={editor.inventoryUnit} onChange={(event) => setEditor({ ...editor, inventoryUnit: event.target.value as ProductInput["inventoryUnit"] })}>{inventoryUnits.map((unit) => <option value={unit} key={unit}>{unit}</option>)}</select></label><label>Selling unit<select value={editor.sellingUnit} onChange={(event) => setEditor({ ...editor, sellingUnit: event.target.value as ProductInput["sellingUnit"] })}>{inventoryUnits.map((unit) => <option value={unit} key={unit}>{unit}</option>)}</select></label><label>Unit conversion to inventory<input type="number" min="0.000001" step="any" value={editor.unitRatioMicro / QUANTITY_SCALE} onChange={(event) => setEditor({ ...editor, unitRatioMicro: Math.round(Number(event.target.value) * QUANTITY_SCALE) })} /></label><label>Package size<input type="number" min="0.000001" step="any" value={editor.packageSizeMicro / QUANTITY_SCALE} onChange={(event) => setEditor({ ...editor, packageSizeMicro: Math.round(Number(event.target.value) * QUANTITY_SCALE) })} /></label><label>Cost price<input type="number" min="0" step="0.01" value={editor.costPriceCents / 100} onChange={(event) => setEditor({ ...editor, costPriceCents: Math.round(Number(event.target.value) * 100) })} /></label><label>Retail price<input type="number" min="0" step="0.01" value={editor.retailPriceCents / 100} onChange={(event) => setEditor({ ...editor, retailPriceCents: Math.round(Number(event.target.value) * 100) })} /></label><label>Wholesale price<input type="number" min="0" step="0.01" value={editor.wholesalePriceCents / 100} onChange={(event) => setEditor({ ...editor, wholesalePriceCents: Math.round(Number(event.target.value) * 100) })} /></label><label>Wholesale starts at<input type="number" min="0" step="any" value={editor.wholesaleThresholdMicro / QUANTITY_SCALE} onChange={(event) => setEditor({ ...editor, wholesaleThresholdMicro: Math.round(Number(event.target.value) * QUANTITY_SCALE) })} /></label><label>Tax (%)<input type="number" min="0" max="100" step="0.01" value={editor.taxBasisPoints / 100} onChange={(event) => setEditor({ ...editor, taxBasisPoints: Math.round(Number(event.target.value) * 100) })} /></label><label>Low-stock threshold<input type="number" min="0" step="any" value={editor.minimumStockMicro / QUANTITY_SCALE} onChange={(event) => setEditor({ ...editor, minimumStockMicro: Math.round(Number(event.target.value) * QUANTITY_SCALE) })} /></label></div><div className="dialog-actions"><button type="button" className="button ghost" onClick={() => setEditor(null)}>Cancel</button><button className="button primary" disabled={busy}>Save product</button></div></form></div> : null}

      {importPreview ? <div className="dialog-backdrop"><section className="dialog import-dialog"><div className="dialog-title"><div><h2>Import preview</h2><p>{importPreview.sourceName} · {importPreview.validCount} valid · {importPreview.invalidCount} invalid</p></div><button aria-label="Close import preview" onClick={() => setImportPreview(null)}><X size={20} /></button></div><div className="table-scroll"><table><thead><tr><th>Row</th><th>Product</th><th>SKU / barcode</th><th>Stock</th><th>Status</th></tr></thead><tbody>{importPreview.rows.slice(0, 500).map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.name || "Missing"}</td><td>{row.sku}{row.barcode ? ` / ${row.barcode}` : ""}</td><td>{formatQuantity(row.startingStockMicro)}</td><td className={row.errors.length ? "low" : "success"}>{row.errors.join(" ") || "Ready"}</td></tr>)}</tbody></table></div><label>When SKU or barcode already exists<select value={importMode} onChange={(event) => setImportMode(event.target.value as typeof importMode)}><option value="SKIP">Skip existing product</option><option value="UPDATE">Update product and add starting stock</option></select></label><div className="dialog-actions"><button className="button ghost" onClick={() => setImportPreview(null)}>Cancel</button><button className="button primary" disabled={busy || importPreview.invalidCount > 0} onClick={() => void executeImport()}>Import {importPreview.validCount} rows</button></div></section></div> : null}
    </section>
  );
}
