import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BadgeDollarSign, FileSpreadsheet, History, ImagePlus, Pencil, Plus, RefreshCw, Search, Tag, Trash2, X } from "lucide-react";
import { formatMoney, formatQuantity, inventoryUnits, QUANTITY_SCALE, type ProductActivityRecord, type ProductInput, type ProductRecord } from "../../domain/models";
import type { ImportPreview, ImportProgress } from "../../services/import-export-service";
import type { ProductPriceRule } from "../../services/pricing-service";
import { useOfflineApp } from "../app-context";
import { useDebouncedValue } from "../use-debounced-value";

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

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    PRODUCT_CREATED: "Product added",
    PRODUCT_UPDATED: "Product edited",
    PRODUCT_DEACTIVATED: "Product removed",
    STOCK_IN: "Restocked",
    STOCK_OUT: "Stock removed",
    ADJUSTMENT: "Count adjusted",
    SALE: "Sold",
    RETURN: "Returned"
  };
  return labels[action] ?? action.replaceAll("_", " ").toLowerCase();
}

function activityTone(action: string) {
  if (["PRODUCT_DEACTIVATED", "STOCK_OUT", "SALE"].includes(action)) return "negative";
  if (["PRODUCT_CREATED", "STOCK_IN", "RETURN"].includes(action)) return "positive";
  return "neutral";
}

type PriceDraft = {
  id?: string;
  priceLevelId: string;
  price: number;
  minimumQuantity: number;
  effectiveAt: string;
  expiresAt: string;
  active: boolean;
};

function dateTimeInput(iso = new Date().toISOString()) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function InventoryView() {
  const { app, user, revision, refresh, notify, inventoryFocusId, clearInventoryFocus } = useOfflineApp();
  const canManageInventory = user.permissions.includes("*") || user.permissions.includes("inventory.manage");
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ALL");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const productRequest = useRef(0);
  const [editor, setEditor] = useState<ProductInput | null>(null);
  const [stockProductId, setStockProductId] = useState("");
  const [stockType, setStockType] = useState<"STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT">("STOCK_IN");
  const [stockQuantity, setStockQuantity] = useState(0);
  const [stockReason, setStockReason] = useState("Stock received");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<"SKIP" | "UPDATE">("SKIP");
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const importAbort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [defaultThresholdMicro, setDefaultThresholdMicro] = useState(0);
  const [activity, setActivity] = useState<ProductActivityRecord[]>([]);
  const [activityFilter, setActivityFilter] = useState<"ALL" | ProductActivityRecord["kind"]>("ALL");
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [priceProduct, setPriceProduct] = useState<ProductRecord | null>(null);
  const [priceLevels, setPriceLevels] = useState<Array<{ id: string; code: string; name: string; priority: number }>>([]);
  const [priceRules, setPriceRules] = useState<ProductPriceRule[]>([]);
  const [priceDraft, setPriceDraft] = useState<PriceDraft | null>(null);

  useEffect(() => { void Promise.all([app.catalog.listCategories(), app.settingsReports.getSettings()]).then(([nextCategories, settings]) => { setCategories(nextCategories); setDefaultThresholdMicro(settings.defaultLowStockThresholdMicro); }); }, [app, revision]);
  useEffect(() => {
    const request = ++productRequest.current;
    setProductsLoading(true);
    setProductsError(null);
    void app.catalog.listProductPage({ search: debouncedSearch, categoryId: categoryFilter || null, status: statusFilter, pageSize: 80 }).then((page) => {
      if (request !== productRequest.current) return;
      setProducts(page.items);
      setNextCursor(page.nextCursor);
      setStockProductId((current) => current && page.items.some((item) => item.id === current) ? current : page.items[0]?.id ?? "");
    }).catch((caught: unknown) => {
      if (request === productRequest.current) setProductsError(caught instanceof Error ? caught.message : "Products could not be loaded.");
    }).finally(() => { if (request === productRequest.current) setProductsLoading(false); });
  }, [app, categoryFilter, debouncedSearch, revision, statusFilter]);
  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);
    setActivityError(null);
    void app.inventory.listProductActivity(500).then((items) => {
      if (!cancelled) setActivity(items);
    }).catch((caught: unknown) => {
      if (!cancelled) setActivityError(caught instanceof Error ? caught.message : "Product activity could not be loaded.");
    }).finally(() => {
      if (!cancelled) setActivityLoading(false);
    });
    return () => { cancelled = true; };
  }, [app, revision]);
  useEffect(() => {
    if (!inventoryFocusId) return;
    void app.catalog.getProduct(inventoryFocusId).then((product) => {
      setSearch("");
      setProducts((current) => current.some((item) => item.id === product.id) ? current : [product, ...current]);
      setEditor(productToInput(product));
      setStockProductId(product.id);
      clearInventoryFocus();
    }).catch((caught: unknown) => notify(caught instanceof Error ? caught.message : "The inventory item could not be opened.", "error"));
  }, [app, inventoryFocusId, clearInventoryFocus, notify]);
  const selectedStockProduct = useMemo(() => products.find((product) => product.id === stockProductId), [products, stockProductId]);
  const filteredActivity = useMemo(() => activityFilter === "ALL" ? activity : activity.filter((item) => item.kind === activityFilter), [activity, activityFilter]);

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
    const controller = new AbortController();
    importAbort.current = controller;
    setImportProgress({ processed: 0, total: importPreview.rows.length, created: 0, updated: 0, skipped: 0 });
    try {
      const result = await app.importExport.executeProductImport(user, importPreview, importMode, { signal: controller.signal, onProgress: setImportProgress });
      setImportPreview(null);
      refresh();
      notify(`Imported ${result.created} new and ${result.updated} updated products.`, "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Import failed.", "error"); }
    finally { importAbort.current = null; setImportProgress(null); setBusy(false); }
  }

  async function addCategory() {
    const name = window.prompt("New category name");
    if (!name) return;
    try { const id = await app.catalog.saveCategory(user, name); setCategories(await app.catalog.listCategories()); if (editor) setEditor({ ...editor, categoryId: id }); refresh(); }
    catch (error) { notify(error instanceof Error ? error.message : "Category could not be created.", "error"); }
  }

  async function loadMoreProducts() {
    if (!nextCursor || productsLoading) return;
    setProductsLoading(true);
    try {
      const page = await app.catalog.listProductPage({ search: debouncedSearch, categoryId: categoryFilter || null, status: statusFilter, pageSize: 80, cursor: nextCursor });
      setProducts((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (caught) { notify(caught instanceof Error ? caught.message : "More products could not be loaded.", "error"); }
    finally { setProductsLoading(false); }
  }

  async function openPrices(product: ProductRecord) {
    setBusy(true);
    try {
      const [levels, rules] = await Promise.all([app.pricing.listLevels(), app.pricing.listRules(product.id)]);
      setPriceProduct(product);
      setPriceLevels(levels);
      setPriceRules(rules);
      setPriceDraft({ priceLevelId: levels[0]?.id ?? "", price: product.retailPriceCents / 100, minimumQuantity: 0, effectiveAt: dateTimeInput(), expiresAt: "", active: true });
    } catch (error) { notify(error instanceof Error ? error.message : "Prices could not be loaded.", "error"); }
    finally { setBusy(false); }
  }

  function editPriceRule(rule: ProductPriceRule) {
    setPriceDraft({ id: rule.id, priceLevelId: rule.priceLevelId, price: rule.priceCents / 100, minimumQuantity: rule.minimumQuantityMicro / QUANTITY_SCALE, effectiveAt: dateTimeInput(rule.effectiveAt), expiresAt: rule.expiresAt ? dateTimeInput(rule.expiresAt) : "", active: rule.active });
  }

  async function savePriceRule(event: FormEvent) {
    event.preventDefault();
    if (!priceProduct || !priceDraft?.priceLevelId) return;
    setBusy(true);
    try {
      await app.pricing.saveRule(user, {
        id: priceDraft.id,
        productId: priceProduct.id,
        priceLevelId: priceDraft.priceLevelId,
        priceCents: Math.round(priceDraft.price * 100),
        minimumQuantityMicro: Math.round(priceDraft.minimumQuantity * QUANTITY_SCALE),
        effectiveAt: new Date(priceDraft.effectiveAt).toISOString(),
        expiresAt: priceDraft.expiresAt ? new Date(priceDraft.expiresAt).toISOString() : null,
        active: priceDraft.active
      });
      setPriceRules(await app.pricing.listRules(priceProduct.id));
      setPriceDraft({ priceLevelId: priceLevels[0]?.id ?? "", price: priceProduct.retailPriceCents / 100, minimumQuantity: 0, effectiveAt: dateTimeInput(), expiresAt: "", active: true });
      refresh();
      notify("Price rule saved.", "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Price rule could not be saved.", "error"); }
    finally { setBusy(false); }
  }

  return (
    <section className="page-stack">
      <header className="page-header"><div><h2>Inventory</h2><p>Products, physical stock, reservations, and permanent movement history.</p></div>{canManageInventory ? <div className="header-actions"><button className="button secondary" onClick={() => void addCategory()} disabled={busy}><Tag size={18} /> Category</button><button className="button secondary" onClick={() => void chooseImport()} disabled={busy}><FileSpreadsheet size={18} /> Import</button><button className="button secondary" disabled={busy || !stockProductId} onClick={() => { setBusy(true); void app.productImages.pickAndSave(user, stockProductId).then(() => { refresh(); notify("Product image saved.", "success"); }).catch((error: unknown) => notify(error instanceof Error ? error.message : "Image could not be saved.", "error")).finally(() => setBusy(false)); }}><ImagePlus size={18} /> Image</button><button className="button primary" onClick={() => setEditor(emptyProduct())}><Plus size={18} /> Product</button></div> : null}</header>
      {importProgress ? <section className="import-progress" role="status"><div><strong>Importing {importProgress.processed.toLocaleString()} of {importProgress.total.toLocaleString()}</strong><span>{importProgress.created.toLocaleString()} new | {importProgress.updated.toLocaleString()} updated | {importProgress.skipped.toLocaleString()} skipped</span></div><progress value={importProgress.processed} max={importProgress.total} /><button className="button secondary" onClick={() => importAbort.current?.abort()}>Cancel import</button></section> : null}
      <div className="catalog-filter-bar"><label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, or barcode" /></label><label>Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label></div>
      {productsError ? <p className="inline-error" role="alert">{productsError}</p> : null}
      <div className="inventory-layout">
        <section className="data-panel product-list-panel">
          <div className="table-scroll"><table><thead><tr><th>Product</th><th>Physical</th><th>Reserved</th><th>Available</th><th>Price</th>{canManageInventory ? <th aria-label="Actions" /> : null}</tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku}{product.barcode ? ` · ${product.barcode}` : ""}</small></td><td>{formatQuantity(product.stockMicro)}</td><td>{formatQuantity(product.reservedMicro)}</td><td className={isLowStock(product, defaultThresholdMicro) ? "low" : ""}>{formatQuantity(product.availableMicro)}</td><td>{formatMoney(product.retailPriceCents)}</td>{canManageInventory ? <td><div className="row-actions"><button aria-label={`Edit ${product.name}`} onClick={() => setEditor(productToInput(product))}><Pencil size={17} /></button><button aria-label={`Manage prices for ${product.name}`} onClick={() => void openPrices(product)}><BadgeDollarSign size={17} /></button><button className="icon-danger" aria-label={`Deactivate ${product.name}`} onClick={() => { const reason = window.prompt(`Reason for deactivating ${product.name}`); if (reason) void app.catalog.deactivateProduct(user, product.id, reason).then(refresh).catch((error: unknown) => notify(error instanceof Error ? error.message : "Unable to deactivate product.", "error")); }}><Trash2 size={17} /></button></div></td> : null}</tr>)}</tbody></table></div>
          {productsLoading && !products.length ? <p className="loading" role="status">Loading products...</p> : null}
          {!productsLoading && !products.length ? <p className="empty-state">No matching products.</p> : null}
          {nextCursor ? <button className="button secondary load-more" disabled={productsLoading} onClick={() => void loadMoreProducts()}>{productsLoading ? "Loading..." : "Load more products"}</button> : null}
        </section>
        {canManageInventory ? <form className="data-panel stock-form" onSubmit={saveStock}><h3>Stock movement</h3><label>Product<select value={stockProductId} onChange={(event) => setStockProductId(event.target.value)}>{products.filter((product) => product.status === "ACTIVE").map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label><label>Movement<select value={stockType} onChange={(event) => setStockType(event.target.value as typeof stockType)}><option value="STOCK_IN">Add stock</option><option value="STOCK_OUT">Remove stock</option><option value="ADJUSTMENT">Set counted stock</option></select></label><label>{stockType === "ADJUSTMENT" ? "Counted quantity" : "Quantity"}<input type="number" min="0" step="any" value={stockQuantity} onChange={(event) => setStockQuantity(Number(event.target.value))} required /></label><label>Reason<input value={stockReason} onChange={(event) => setStockReason(event.target.value)} minLength={3} required /></label>{selectedStockProduct ? <p className="stock-summary">Current available: <strong>{formatQuantity(selectedStockProduct.availableMicro)} {selectedStockProduct.inventoryUnit.toLowerCase()}</strong></p> : null}<button className="button primary wide" disabled={busy || !stockProductId}><RefreshCw size={18} /> Save stock</button></form> : null}
      </div>

      <section className="data-panel product-activity-panel">
        <header><div><History size={20} /><div><h3>Product activity</h3><p>Permanent history of product and stock changes.</p></div></div><span>{filteredActivity.length} events</span></header>
        <div className="activity-toolbar"><div className="segmented" aria-label="Product activity filter"><button className={activityFilter === "ALL" ? "active" : ""} onClick={() => setActivityFilter("ALL")}>All</button><button className={activityFilter === "PRODUCT" ? "active" : ""} onClick={() => setActivityFilter("PRODUCT")}>Products</button><button className={activityFilter === "STOCK" ? "active" : ""} onClick={() => setActivityFilter("STOCK")}>Stock</button></div></div>
        {activityError ? <p className="error-banner">{activityError}</p> : null}
        {!activityLoading && !activityError ? <div className="table-scroll"><table className="activity-table"><thead><tr><th>Date</th><th>Product</th><th>Activity</th><th>Quantity change</th><th>By</th><th>Details</th></tr></thead><tbody>{filteredActivity.map((item) => <tr key={`${item.kind}-${item.id}`}><td className="activity-date">{new Date(item.createdAt).toLocaleString("en-PH")}</td><td><strong>{item.productName}</strong></td><td><span className={`activity-action ${activityTone(item.action)}`}>{activityLabel(item.action)}</span></td><td className={`activity-quantity ${item.quantityMicro === null ? "neutral" : item.quantityMicro > 0 ? "positive" : "negative"}`}>{item.quantityMicro === null ? "-" : `${item.quantityMicro > 0 ? "+" : ""}${formatQuantity(item.quantityMicro)} ${item.inventoryUnit.toLowerCase()}`}</td><td>{item.actorName ?? "System"}</td><td>{item.reason ?? (item.kind === "PRODUCT" ? activityLabel(item.action) : "Stock updated")}{item.referenceType ? <small>{item.referenceType}</small> : null}</td></tr>)}</tbody></table></div> : null}
        {activityLoading ? <p className="empty-state">Loading product activity...</p> : null}
        {!activityLoading && !activityError && !filteredActivity.length ? <p className="empty-state">No matching product activity yet.</p> : null}
      </section>

      {editor ? <div className="dialog-backdrop"><form className="dialog product-dialog" onSubmit={saveProduct}><div className="dialog-title"><h2>{editor.id ? "Edit product" : "Add product"}</h2><button type="button" aria-label="Close product form" onClick={() => setEditor(null)}><X size={20} /></button></div><div className="form-grid"><label className="span-2">Product name<input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} required /></label><label>SKU optional<input value={editor.sku} onChange={(event) => setEditor({ ...editor, sku: event.target.value })} /></label><label>Barcode optional<input value={editor.barcode ?? ""} onChange={(event) => setEditor({ ...editor, barcode: event.target.value || null })} inputMode="numeric" /></label><label>Category<select value={editor.categoryId ?? ""} onChange={(event) => setEditor({ ...editor, categoryId: event.target.value || null })}><option value="">Uncategorized</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>Status<select value={editor.status} onChange={(event) => setEditor({ ...editor, status: event.target.value as ProductInput["status"] })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label><label>Inventory unit<select value={editor.inventoryUnit} onChange={(event) => setEditor({ ...editor, inventoryUnit: event.target.value as ProductInput["inventoryUnit"] })}>{inventoryUnits.map((unit) => <option value={unit} key={unit}>{unit}</option>)}</select></label><label>Selling unit<select value={editor.sellingUnit} onChange={(event) => setEditor({ ...editor, sellingUnit: event.target.value as ProductInput["sellingUnit"] })}>{inventoryUnits.map((unit) => <option value={unit} key={unit}>{unit}</option>)}</select></label><label>Unit conversion to inventory<input type="number" min="0.000001" step="any" value={editor.unitRatioMicro / QUANTITY_SCALE} onChange={(event) => setEditor({ ...editor, unitRatioMicro: Math.round(Number(event.target.value) * QUANTITY_SCALE) })} /></label><label>Package size<input type="number" min="0.000001" step="any" value={editor.packageSizeMicro / QUANTITY_SCALE} onChange={(event) => setEditor({ ...editor, packageSizeMicro: Math.round(Number(event.target.value) * QUANTITY_SCALE) })} /></label><label>Cost price<input type="number" min="0" step="0.01" value={editor.costPriceCents / 100} onChange={(event) => setEditor({ ...editor, costPriceCents: Math.round(Number(event.target.value) * 100) })} /></label><label>Retail price<input type="number" min="0" step="0.01" value={editor.retailPriceCents / 100} onChange={(event) => setEditor({ ...editor, retailPriceCents: Math.round(Number(event.target.value) * 100) })} /></label><label>Wholesale price<input type="number" min="0" step="0.01" value={editor.wholesalePriceCents / 100} onChange={(event) => setEditor({ ...editor, wholesalePriceCents: Math.round(Number(event.target.value) * 100) })} /></label><label>Wholesale starts at<input type="number" min="0" step="any" value={editor.wholesaleThresholdMicro / QUANTITY_SCALE} onChange={(event) => setEditor({ ...editor, wholesaleThresholdMicro: Math.round(Number(event.target.value) * QUANTITY_SCALE) })} /></label><label>Tax (%)<input type="number" min="0" max="100" step="0.01" value={editor.taxBasisPoints / 100} onChange={(event) => setEditor({ ...editor, taxBasisPoints: Math.round(Number(event.target.value) * 100) })} /></label><label>Low-stock threshold<input type="number" min="0" step="any" value={editor.minimumStockMicro / QUANTITY_SCALE} onChange={(event) => setEditor({ ...editor, minimumStockMicro: Math.round(Number(event.target.value) * QUANTITY_SCALE) })} /></label></div><div className="dialog-actions"><button type="button" className="button ghost" onClick={() => setEditor(null)}>Cancel</button><button className="button primary" disabled={busy}>Save product</button></div></form></div> : null}

      {priceProduct && priceDraft ? <div className="dialog-backdrop"><section className="dialog price-dialog"><div className="dialog-title"><div><h2>Price levels</h2><p>{priceProduct.name}</p></div><button type="button" aria-label="Close price levels" onClick={() => setPriceProduct(null)}><X size={20} /></button></div><div className="price-rule-list">{priceRules.length ? priceRules.map((rule) => <button type="button" className={priceDraft.id === rule.id ? "active" : ""} key={rule.id} onClick={() => editPriceRule(rule)}><span><strong>{rule.levelName}</strong><small>From {formatQuantity(rule.minimumQuantityMicro)} units</small></span><b>{formatMoney(rule.priceCents)}</b></button>) : <p className="muted">No custom rules. Retail and wholesale product prices are still used.</p>}</div><form className="form-stack" onSubmit={savePriceRule}><label>Price level<select value={priceDraft.priceLevelId} onChange={(event) => setPriceDraft({ ...priceDraft, priceLevelId: event.target.value })}>{priceLevels.map((level) => <option value={level.id} key={level.id}>{level.name}</option>)}</select></label><div className="form-grid"><label>Price<input type="number" min="0" step="0.01" value={priceDraft.price} onChange={(event) => setPriceDraft({ ...priceDraft, price: Number(event.target.value) })} required /></label><label>Minimum quantity<input type="number" min="0" step="any" value={priceDraft.minimumQuantity} onChange={(event) => setPriceDraft({ ...priceDraft, minimumQuantity: Number(event.target.value) })} required /></label><label>Starts<input type="datetime-local" value={priceDraft.effectiveAt} onChange={(event) => setPriceDraft({ ...priceDraft, effectiveAt: event.target.value })} required /></label><label>Ends optional<input type="datetime-local" value={priceDraft.expiresAt} onChange={(event) => setPriceDraft({ ...priceDraft, expiresAt: event.target.value })} /></label></div><label className="toggle-row"><input type="checkbox" checked={priceDraft.active} onChange={(event) => setPriceDraft({ ...priceDraft, active: event.target.checked })} /> Active rule</label><div className="dialog-actions"><button type="button" className="button ghost" onClick={() => setPriceDraft({ priceLevelId: priceLevels[0]?.id ?? "", price: priceProduct.retailPriceCents / 100, minimumQuantity: 0, effectiveAt: dateTimeInput(), expiresAt: "", active: true })}>New rule</button><button className="button primary" disabled={busy}>Save price</button></div></form></section></div> : null}

      {importPreview ? <div className="dialog-backdrop"><section className="dialog import-dialog"><div className="dialog-title"><div><h2>Import preview</h2><p>{importPreview.sourceName} · {importPreview.validCount} valid · {importPreview.invalidCount} invalid</p></div><button aria-label="Close import preview" onClick={() => setImportPreview(null)}><X size={20} /></button></div><div className="table-scroll"><table><thead><tr><th>Row</th><th>Product</th><th>SKU / barcode</th><th>Stock</th><th>Status</th></tr></thead><tbody>{importPreview.rows.slice(0, 500).map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.name || "Missing"}</td><td>{row.sku}{row.barcode ? ` / ${row.barcode}` : ""}</td><td>{formatQuantity(row.startingStockMicro)}</td><td className={row.errors.length ? "low" : "success"}>{row.errors.join(" ") || "Ready"}</td></tr>)}</tbody></table></div><label>When SKU or barcode already exists<select value={importMode} onChange={(event) => setImportMode(event.target.value as typeof importMode)}><option value="SKIP">Skip existing product</option><option value="UPDATE">Update product and add starting stock</option></select></label><div className="dialog-actions"><button className="button ghost" onClick={() => setImportPreview(null)}>Cancel</button><button className="button primary" disabled={busy || importPreview.invalidCount > 0} onClick={() => void executeImport()}>Import {importPreview.validCount} rows</button></div></section></div> : null}
    </section>
  );
}
