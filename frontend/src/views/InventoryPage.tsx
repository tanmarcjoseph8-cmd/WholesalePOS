import { Download, FileSpreadsheet, Pencil, Plus, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import type { FocusEvent } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adjustInventoryCount,
  createInventoryMovement,
  createProduct,
  deleteProduct,
  fetchInventoryMovements,
  fetchProducts,
  fetchStock,
  fetchWarehouses,
  importProducts,
  type Product,
  type ProductCreatePayload,
  type ProductImportPayload,
  type ProductImportResult,
  updateProduct
} from "../lib/api";
import { formatCurrency } from "../lib/currency";
import { refreshStockAwareViews } from "../lib/realtime";

const emptyProduct: ProductCreatePayload = {
  sku: "",
  name: "",
  brand: "",
  barcode: "",
  inventoryUnit: "PIECE",
  sellingUnit: "PIECE",
  costPrice: 0,
  retailPrice: 0,
  wholesalePrice: 0,
  packageSize: 1,
  wholesaleThreshold: 0,
  minimumStock: 0
};

const unitOptions = [
  { value: "PIECE", label: "Piece" },
  { value: "KILOGRAM", label: "Kilogram" },
  { value: "GRAM", label: "Gram" },
  { value: "LITER", label: "Liter" },
  { value: "MILLILITER", label: "Milliliter" },
  { value: "METER", label: "Meter" },
  { value: "YARD", label: "Yard" },
  { value: "CENTIMETER", label: "Centimeter" },
  { value: "PACK", label: "Pack" },
  { value: "CASE", label: "Case" },
  { value: "BUNDLE", label: "Bundle" },
  { value: "BOTTLE", label: "Bottle" },
  { value: "ROLL", label: "Roll" }
];

const importTemplateHeaders = [
  "Name",
  "SKU",
  "Barcode",
  "Brand",
  "Stock Unit",
  "Selling Unit",
  "Cost Price",
  "Retail Price",
  "Wholesale Price",
  "Package Size",
  "Wholesale Threshold",
  "Low Stock Alert",
  "Initial Stock",
  "Unit Cost"
];

const unitAliases = new Map<string, string>(
  unitOptions.flatMap((unit) => [
    [unit.value.toLowerCase(), unit.value],
    [unit.label.toLowerCase(), unit.value]
  ])
);

function selectInputValue(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}

function productToForm(product: Product): ProductCreatePayload {
  return {
    sku: product.sku,
    name: product.name,
    brand: product.brand ?? "",
    barcode: product.barcodes.find((barcode) => barcode.isPrimary)?.value ?? product.barcodes[0]?.value ?? "",
    inventoryUnit: product.inventoryUnit,
    sellingUnit: product.sellingUnit,
    costPrice: product.costPrice,
    retailPrice: product.retailPrice,
    wholesalePrice: product.wholesalePrice,
    packageSize: product.packageSize,
    wholesaleThreshold: product.wholesaleThreshold,
    minimumStock: product.minimumStock
  };
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readImportValue(row: Record<string, unknown>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  const entry = Object.entries(row).find(([key]) => normalizedAliases.includes(normalizeHeader(key)));
  return entry?.[1];
}

function readImportText(row: Record<string, unknown>, aliases: string[]) {
  const value = readImportValue(row, aliases);
  return value === null || value === undefined ? "" : String(value).trim();
}

function readImportNumber(row: Record<string, unknown>, aliases: string[], fallback: number) {
  const value = readImportValue(row, aliases);
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readImportUnit(row: Record<string, unknown>, aliases: string[], fallback: string) {
  const rawValue = readImportText(row, aliases);
  if (!rawValue) return fallback;
  return unitAliases.get(rawValue.toLowerCase()) ?? fallback;
}

function importRowToProduct(row: Record<string, unknown>): ProductImportPayload {
  const inventoryUnit = readImportUnit(row, ["Stock Unit", "Inventory Unit", "Unit"], "PIECE");
  const sellingUnit = readImportUnit(row, ["Selling Unit", "Sale Unit"], inventoryUnit);
  const costPrice = readImportNumber(row, ["Cost Price", "Cost"], 0);
  return {
    name: readImportText(row, ["Name", "Product", "Product Name"]),
    sku: readImportText(row, ["SKU", "Sku"]),
    barcode: readImportText(row, ["Barcode", "Bar Code"]),
    brand: readImportText(row, ["Brand"]),
    inventoryUnit,
    sellingUnit,
    costPrice,
    retailPrice: readImportNumber(row, ["Retail Price", "Retail", "Price"], 0),
    wholesalePrice: readImportNumber(row, ["Wholesale Price", "Wholesale"], 0),
    packageSize: Math.max(readImportNumber(row, ["Package Size", "Pack Size"], 1), 0.001),
    wholesaleThreshold: readImportNumber(row, ["Wholesale Threshold", "Wholesale Qty"], 0),
    minimumStock: readImportNumber(row, ["Low Stock Alert", "Minimum Stock", "Reorder Point"], 0),
    initialStock: readImportNumber(row, ["Initial Stock", "Stock", "Quantity"], 0),
    unitCost: readImportNumber(row, ["Unit Cost"], costPrice)
  };
}

function validateImportRows(rows: ProductImportPayload[]) {
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.name.length < 2) errors.push(`Row ${rowNumber}: product name is required.`);
    if (row.retailPrice < 0 || row.wholesalePrice < 0 || row.costPrice < 0) errors.push(`Row ${rowNumber}: prices cannot be negative.`);
    if (row.packageSize <= 0) errors.push(`Row ${rowNumber}: package size must be greater than 0.`);
    if (row.initialStock < 0) errors.push(`Row ${rowNumber}: initial stock cannot be negative.`);
  });
  return errors;
}

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [product, setProduct] = useState<ProductCreatePayload>(emptyProduct);
  const [editingProductId, setEditingProductId] = useState("");
  const [editingProduct, setEditingProduct] = useState<ProductCreatePayload>(emptyProduct);
  const [importRows, setImportRows] = useState<ProductImportPayload[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<ProductImportResult | null>(null);
  const [stockProductOverrides, setStockProductOverrides] = useState<Product[]>([]);
  const [stockForm, setStockForm] = useState({
    productId: "",
    warehouseId: "",
    type: "STOCK_IN" as "STOCK_IN" | "STOCK_OUT" | "DAMAGE" | "RETURN" | "PURCHASE_RECEIPT" | "COUNT",
    quantity: 0,
    unitCost: 0,
    reason: "Manual stock update"
  });
  const [stockMessage, setStockMessage] = useState("");
  const products = useQuery({
    queryKey: ["products", search],
    queryFn: () => fetchProducts(search)
  });
  const stockProducts = useQuery({
    queryKey: ["products", "stock-selector"],
    queryFn: () => fetchProducts("", 1000)
  });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: fetchWarehouses });
  const stock = useQuery({ queryKey: ["stock", search], queryFn: () => fetchStock(search) });
  const lowStock = useQuery({ queryKey: ["stock", "low"], queryFn: () => fetchStock("", true) });
  const movements = useQuery({ queryKey: ["inventory-movements"], queryFn: () => fetchInventoryMovements() });
  const defaultWarehouseId = warehouses.data?.[0]?.id ?? "";
  const selectedWarehouseId = stockForm.warehouseId || defaultWarehouseId;
  const reorderRows = useMemo(
    () =>
      (stock.data?.items ?? [])
        .filter((item) => item.product.minimumStock > 0 && item.quantity <= item.product.minimumStock)
        .map((item) => ({
          ...item,
          suggestedOrder: Math.max(item.product.minimumStock * 2 - item.quantity, 0)
        }))
        .sort((first, second) => {
          const firstRatio = first.quantity / Math.max(first.product.minimumStock, 0.001);
          const secondRatio = second.quantity / Math.max(second.product.minimumStock, 0.001);
          return firstRatio - secondRatio || first.product.name.localeCompare(second.product.name);
        }),
    [stock.data?.items]
  );
  const stockSelectorProducts = useMemo(() => {
    const productsById = new Map<string, Product>();

    for (const item of stockProducts.data?.items ?? []) productsById.set(item.id, item);
    for (const item of products.data?.items ?? []) productsById.set(item.id, item);
    for (const item of stockProductOverrides) productsById.set(item.id, item);

    return Array.from(productsById.values()).sort((first, second) => first.name.localeCompare(second.name));
  }, [products.data?.items, stockProducts.data?.items, stockProductOverrides]);

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async (createdProduct) => {
      setProduct(emptyProduct);
      setIsAdding(false);
      setStockProductOverrides((current) => [createdProduct, ...current.filter((item) => item.id !== createdProduct.id)]);
      setStockForm((current) => ({ ...current, productId: createdProduct.id }));
      setStockMessage(`${createdProduct.name} is selected for stock entry.`);
      await refreshStockAwareViews(queryClient);
    }
  });
  const updateMutation = useMutation({
    mutationFn: updateProduct,
    onSuccess: async (updatedProduct) => {
      setEditingProductId("");
      setEditingProduct(emptyProduct);
      setStockProductOverrides((current) => [updatedProduct, ...current.filter((item) => item.id !== updatedProduct.id)]);
      setStockMessage(`${updatedProduct.name} was updated.`);
      await refreshStockAwareViews(queryClient);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: async () => {
      setEditingProductId("");
      setEditingProduct(emptyProduct);
      setStockForm((current) => ({ ...current, productId: "" }));
      setStockMessage("Product was removed from active inventory.");
      await refreshStockAwareViews(queryClient);
    }
  });
  const stockMutation = useMutation({
    mutationFn: async () => {
      setStockMessage("");
      if (stockForm.type === "COUNT") {
        return adjustInventoryCount({
          productId: stockForm.productId,
          warehouseId: selectedWarehouseId,
          countedQuantity: stockForm.quantity,
          reason: stockForm.reason
        });
      }

      return createInventoryMovement({
        productId: stockForm.productId,
        warehouseId: selectedWarehouseId,
        type: stockForm.type,
        quantity: stockForm.quantity,
        unitCost: stockForm.type === "STOCK_IN" || stockForm.type === "PURCHASE_RECEIPT" ? stockForm.unitCost : null,
        reason: stockForm.reason
      });
    },
    onSuccess: async () => {
      setStockMessage("Inventory saved. Stock balances and history were updated.");
      setStockForm((current) => ({ ...current, quantity: 0, unitCost: 0, reason: "Manual stock update" }));
      await refreshStockAwareViews(queryClient);
    }
  });
  const importMutation = useMutation({
    mutationFn: () => importProducts({ warehouseId: selectedWarehouseId, rows: importRows }),
    onSuccess: async (result) => {
      setImportResult(result);
      if (result.createdCount > 0) {
        setImportRows([]);
      }
      await refreshStockAwareViews(queryClient);
    }
  });

  const productCount = useMemo(() => products.data?.pagination.total ?? 0, [products.data?.pagination.total]);
  const canSaveStock = Boolean(stockForm.productId && selectedWarehouseId && stockForm.quantity > 0 && stockForm.reason.trim().length >= 3);

  function beginEditing(item: Product) {
    setIsAdding(false);
    setEditingProductId(item.id);
    setEditingProduct(productToForm(item));
  }

  function confirmDelete(item: Product) {
    const confirmed = window.confirm(`Remove ${item.name} from active products? Sales and stock history will stay saved.`);
    if (confirmed) {
      deleteMutation.mutate(item.id);
    }
  }

  async function loadImportFile(file: File) {
    setImportResult(null);
    setImportErrors([]);
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const [firstSheetName] = workbook.SheetNames;
    const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
    if (!worksheet) {
      setImportRows([]);
      setImportErrors(["The file does not contain a readable sheet."]);
      return;
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
    const parsedRows = rawRows.map(importRowToProduct).filter((row) => row.name || row.sku || row.barcode);
    const validationErrors = validateImportRows(parsedRows);
    setImportRows(parsedRows);
    setImportErrors(validationErrors);
  }

  function downloadImportTemplate() {
    void (async () => {
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.aoa_to_sheet([
        importTemplateHeaders,
        ["Steel Bar", "", "123456789012", "Generic", "Piece", "Piece", 180, 220, 200, 1, 10, 5, 25, 180]
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
      XLSX.writeFile(workbook, "WholesalePOS-product-import-template.xlsx");
    })();
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Inventory Control</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {productCount} products saved on this device. {lowStock.data?.pagination.total ?? 0} low-stock alerts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="focus-ring inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-700" onClick={downloadImportTemplate}>
            <Download size={18} />
            Template
          </button>
          <button className="focus-ring inline-flex items-center gap-2 rounded-md bg-ocean px-4 py-2 text-sm font-bold text-white" onClick={() => setIsAdding(true)}>
            <Plus size={18} />
            Add Product
          </button>
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          className="focus-ring h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-900"
          placeholder="Search name, SKU, brand, or barcode"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Import Products</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Upload an Excel or CSV file with product rows and optional starting stock.</p>
          </div>
          <label className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-700">
            <FileSpreadsheet size={18} />
            Choose File
            <input
              className="sr-only"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadImportFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        {importRows.length ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
              <span className="font-semibold">
                {importRows.length} product row{importRows.length === 1 ? "" : "s"} ready for review.
              </span>
              <button
                className="focus-ring inline-flex items-center gap-2 rounded-md bg-mint px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={importMutation.isPending || importErrors.length > 0 || !selectedWarehouseId}
                onClick={() => importMutation.mutate()}
              >
                <Upload size={16} />
                {importMutation.isPending ? "Importing..." : "Import Products"}
              </button>
            </div>
            {importErrors.length ? (
              <div className="rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose">
                {importErrors.slice(0, 5).map((error) => (
                  <p key={error}>{error}</p>
                ))}
                {importErrors.length > 5 ? <p>{importErrors.length - 5} more import issue{importErrors.length - 5 === 1 ? "" : "s"} found.</p> : null}
              </div>
            ) : null}
            {importMutation.error ? <p className="rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose">{importMutation.error.message}</p> : null}
            <div className="max-h-72 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Barcode</th>
                    <th className="px-4 py-3">Retail</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Low Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.slice(0, 25).map((row, index) => (
                    <tr key={`${row.name}-${index}`} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3 font-semibold">{row.name || "-"}</td>
                      <td className="px-4 py-3">{row.sku || "-"}</td>
                      <td className="px-4 py-3">{row.barcode || "-"}</td>
                      <td className="px-4 py-3">{formatCurrency(row.retailPrice)}</td>
                      <td className="px-4 py-3">
                        {row.initialStock.toLocaleString(undefined, { maximumFractionDigits: 3 })} {row.inventoryUnit.toLowerCase()}
                      </td>
                      <td className="px-4 py-3">{row.minimumStock.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {importResult ? (
          <div className="mt-4 rounded-md bg-mint/10 p-3 text-sm font-semibold text-mint">
            Imported {importResult.createdCount} product{importResult.createdCount === 1 ? "" : "s"}. {importResult.failedCount ? `${importResult.failedCount} row${importResult.failedCount === 1 ? "" : "s"} failed.` : "No failed rows."}
          </div>
        ) : null}
      </section>

      {isAdding ? (
        <form
          className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate(product);
          }}
        >
          <label className="text-sm font-semibold">
            Product name
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={product.name}
              onChange={(event) => setProduct((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            SKU (optional)
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={product.sku ?? ""}
              onChange={(event) => setProduct((current) => ({ ...current, sku: event.target.value }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Barcode (optional)
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={product.barcode ?? ""}
              onChange={(event) => setProduct((current) => ({ ...current, barcode: event.target.value }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Brand
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={product.brand ?? ""}
              onChange={(event) => setProduct((current) => ({ ...current, brand: event.target.value }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Stock unit
            <select
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={product.inventoryUnit}
              onChange={(event) =>
                setProduct((current) => ({
                  ...current,
                  inventoryUnit: event.target.value,
                  sellingUnit: current.sellingUnit === current.inventoryUnit ? event.target.value : current.sellingUnit
                }))
              }
            >
              {unitOptions.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Selling unit
            <select
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={product.sellingUnit}
              onChange={(event) => setProduct((current) => ({ ...current, sellingUnit: event.target.value }))}
            >
              {unitOptions.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Cost price
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0"
              step="0.01"
              value={product.costPrice}
              onFocus={selectInputValue}
              onChange={(event) => setProduct((current) => ({ ...current, costPrice: Number(event.target.value) }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Retail price
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0"
              step="0.01"
              value={product.retailPrice}
              onFocus={selectInputValue}
              onChange={(event) => setProduct((current) => ({ ...current, retailPrice: Number(event.target.value) }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Wholesale price
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0"
              step="0.01"
              value={product.wholesalePrice}
              onFocus={selectInputValue}
              onChange={(event) => setProduct((current) => ({ ...current, wholesalePrice: Number(event.target.value) }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Package size
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0.001"
              step="0.001"
              value={product.packageSize}
              onFocus={selectInputValue}
              onChange={(event) => setProduct((current) => ({ ...current, packageSize: Number(event.target.value) }))}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            Wholesale threshold
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0"
              step="0.001"
              value={product.wholesaleThreshold}
              onFocus={selectInputValue}
              onChange={(event) => setProduct((current) => ({ ...current, wholesaleThreshold: Number(event.target.value) }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Low stock alert
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0"
              step="1"
              value={product.minimumStock}
              onFocus={selectInputValue}
              onChange={(event) => setProduct((current) => ({ ...current, minimumStock: Number(event.target.value) }))}
            />
          </label>
          {createMutation.error ? <p className="rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose md:col-span-2 xl:col-span-4">{createMutation.error.message}</p> : null}
          <div className="flex gap-3 md:col-span-2 xl:col-span-4">
            <button className="focus-ring rounded-md bg-ocean px-4 py-2 text-sm font-bold text-white" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Save Product"}
            </button>
            <button type="button" className="focus-ring rounded-md border border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-700" onClick={() => setIsAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {editingProductId ? (
        <form
          className="grid gap-4 rounded-md border border-ocean/30 bg-white p-5 shadow-sm dark:border-ocean/40 dark:bg-slate-900 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            updateMutation.mutate({ id: editingProductId, ...editingProduct });
          }}
        >
          <div className="flex items-center justify-between md:col-span-2 xl:col-span-4">
            <h3 className="text-lg font-bold">Quick Edit Product</h3>
            <button
              type="button"
              className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-slate-200 dark:border-slate-700"
              aria-label="Close edit product"
              onClick={() => {
                setEditingProductId("");
                setEditingProduct(emptyProduct);
              }}
            >
              <X size={17} />
            </button>
          </div>
          <label className="text-sm font-semibold">
            Product name
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={editingProduct.name}
              onChange={(event) => setEditingProduct((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            SKU
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={editingProduct.sku ?? ""}
              onChange={(event) => setEditingProduct((current) => ({ ...current, sku: event.target.value }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Barcode
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={editingProduct.barcode ?? ""}
              onChange={(event) => setEditingProduct((current) => ({ ...current, barcode: event.target.value }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Brand
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={editingProduct.brand ?? ""}
              onChange={(event) => setEditingProduct((current) => ({ ...current, brand: event.target.value }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Stock unit
            <select
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={editingProduct.inventoryUnit}
              onChange={(event) =>
                setEditingProduct((current) => ({
                  ...current,
                  inventoryUnit: event.target.value,
                  sellingUnit: current.sellingUnit === current.inventoryUnit ? event.target.value : current.sellingUnit
                }))
              }
            >
              {unitOptions.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Selling unit
            <select
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={editingProduct.sellingUnit}
              onChange={(event) => setEditingProduct((current) => ({ ...current, sellingUnit: event.target.value }))}
            >
              {unitOptions.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Cost price
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0"
              step="0.01"
              value={editingProduct.costPrice}
              onFocus={selectInputValue}
              onChange={(event) => setEditingProduct((current) => ({ ...current, costPrice: Number(event.target.value) }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Retail price
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0"
              step="0.01"
              value={editingProduct.retailPrice}
              onFocus={selectInputValue}
              onChange={(event) => setEditingProduct((current) => ({ ...current, retailPrice: Number(event.target.value) }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Wholesale price
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0"
              step="0.01"
              value={editingProduct.wholesalePrice}
              onFocus={selectInputValue}
              onChange={(event) => setEditingProduct((current) => ({ ...current, wholesalePrice: Number(event.target.value) }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Package size
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0.001"
              step="0.001"
              value={editingProduct.packageSize}
              onFocus={selectInputValue}
              onChange={(event) => setEditingProduct((current) => ({ ...current, packageSize: Number(event.target.value) }))}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            Wholesale threshold
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0"
              step="0.001"
              value={editingProduct.wholesaleThreshold}
              onFocus={selectInputValue}
              onChange={(event) => setEditingProduct((current) => ({ ...current, wholesaleThreshold: Number(event.target.value) }))}
            />
          </label>
          <label className="text-sm font-semibold">
            Low stock alert
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0"
              step="1"
              value={editingProduct.minimumStock}
              onFocus={selectInputValue}
              onChange={(event) => setEditingProduct((current) => ({ ...current, minimumStock: Number(event.target.value) }))}
            />
          </label>
          {updateMutation.error ? <p className="rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose md:col-span-2 xl:col-span-4">{updateMutation.error.message}</p> : null}
          <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-4">
            <button className="focus-ring rounded-md bg-ocean px-4 py-2 text-sm font-bold text-white" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-rose/30 px-4 py-2 text-sm font-bold text-rose"
              disabled={deleteMutation.isPending}
              onClick={() => {
                const item = products.data?.items.find((current) => current.id === editingProductId);
                if (item) confirmDelete(item);
              }}
            >
              <Trash2 size={16} />
              Remove Product
            </button>
          </div>
        </form>
      ) : null}

      <form
        className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2 xl:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          stockMutation.mutate();
        }}
      >
        <label className="text-sm font-semibold xl:col-span-2">
          Product
          <select
            className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
            value={stockForm.productId}
            onChange={(event) => setStockForm((current) => ({ ...current, productId: event.target.value }))}
            required
          >
            <option value="">Select product</option>
            {stockProducts.isLoading && stockSelectorProducts.length === 0 ? <option disabled>Loading products...</option> : null}
            {!stockProducts.isLoading && stockSelectorProducts.length === 0 ? <option disabled>No products found</option> : null}
            {stockSelectorProducts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku ? `${item.name} (${item.sku})` : item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Warehouse
          <select
            className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
            value={selectedWarehouseId}
            onChange={(event) => setStockForm((current) => ({ ...current, warehouseId: event.target.value }))}
            required
          >
            {warehouses.data?.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Action
          <select
            className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
            value={stockForm.type}
            onChange={(event) => setStockForm((current) => ({ ...current, type: event.target.value as typeof stockForm.type }))}
          >
            <option value="STOCK_IN">Add stock</option>
            <option value="STOCK_OUT">Remove stock</option>
            <option value="COUNT">Set counted stock</option>
            <option value="DAMAGE">Mark damaged</option>
            <option value="RETURN">Customer return</option>
            <option value="PURCHASE_RECEIPT">Purchase receipt</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Quantity
          <input
            className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
            type="number"
            min="0"
            step="0.001"
            value={stockForm.quantity}
            onFocus={selectInputValue}
            onChange={(event) => setStockForm((current) => ({ ...current, quantity: Number(event.target.value) }))}
            required
          />
        </label>
        <label className="text-sm font-semibold">
          Unit cost
          <input
            className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
            type="number"
            min="0"
            step="0.01"
            value={stockForm.unitCost}
            onFocus={selectInputValue}
            onChange={(event) => setStockForm((current) => ({ ...current, unitCost: Number(event.target.value) }))}
          />
        </label>
        <label className="text-sm font-semibold md:col-span-2 xl:col-span-5">
          Reason
          <input
            className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
            value={stockForm.reason}
            onChange={(event) => setStockForm((current) => ({ ...current, reason: event.target.value }))}
            required
          />
        </label>
        <button className="focus-ring mt-7 h-11 rounded-md bg-mint px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={stockMutation.isPending || !canSaveStock}>
          {stockMutation.isPending ? "Saving..." : "Save Stock"}
        </button>
        {!stockForm.productId || stockForm.quantity <= 0 ? (
          <p className="rounded-md bg-amber/10 p-3 text-sm font-semibold text-amber md:col-span-2 xl:col-span-6">
            Select a product and enter a quantity greater than 0 before saving stock.
          </p>
        ) : null}
        {stockMessage ? <p className="rounded-md bg-mint/10 p-3 text-sm font-semibold text-mint md:col-span-2 xl:col-span-6">{stockMessage}</p> : null}
        {stockMutation.error ? <p className="rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose md:col-span-2 xl:col-span-6">{stockMutation.error.message}</p> : null}
      </form>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="font-bold">Low Stock Reorder List</h3>
        </div>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Current Stock</th>
              <th className="px-4 py-3">Low Alert</th>
              <th className="px-4 py-3">Suggested Order</th>
              <th className="px-4 py-3">Warehouse</th>
            </tr>
          </thead>
          <tbody>
            {stock.isLoading ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={5}>
                  Loading reorder list...
                </td>
              </tr>
            ) : reorderRows.length ? (
              reorderRows.map((item) => (
                <tr key={`reorder-${item.id}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3 font-semibold">{item.product.name}</td>
                  <td className="px-4 py-3">
                    {item.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.product.inventoryUnit.toLowerCase()}
                  </td>
                  <td className="px-4 py-3">
                    {item.product.minimumStock.toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.product.inventoryUnit.toLowerCase()}
                  </td>
                  <td className="px-4 py-3 font-bold text-ocean">
                    {item.suggestedOrder.toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.product.inventoryUnit.toLowerCase()}
                  </td>
                  <td className="px-4 py-3">{item.warehouse.name}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={5}>
                  No products need reordering.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Barcode</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Retail</th>
              <th className="px-4 py-3">Wholesale</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.isLoading ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={8}>
                  Loading products...
                </td>
              </tr>
            ) : products.data?.items.length ? (
              products.data.items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3 font-semibold">
                    {item.name}
                    {item.brand ? <span className="ml-2 text-xs font-normal text-slate-500">{item.brand}</span> : null}
                  </td>
                  <td className="px-4 py-3">{item.sku}</td>
                  <td className="px-4 py-3">{item.barcodes.find((barcode) => barcode.isPrimary)?.value ?? "-"}</td>
                  <td className="px-4 py-3">
                    {item.packageSize} {item.inventoryUnit.toLowerCase()}
                  </td>
                  <td className="px-4 py-3">{formatCurrency(item.retailPrice)}</td>
                  <td className="px-4 py-3">{formatCurrency(item.wholesalePrice)}</td>
                  <td className="px-4 py-3">{item.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-ocean dark:border-slate-700"
                        aria-label={`Edit ${item.name}`}
                        onClick={() => beginEditing(item)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-rose/30 text-rose"
                        aria-label={`Remove ${item.name}`}
                        disabled={deleteMutation.isPending}
                        onClick={() => confirmDelete(item)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={8}>
                  No products yet. Add your first product to start using inventory.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h3 className="font-bold">Stock Balances</h3>
            <button
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-bold dark:border-slate-700"
              type="button"
              onClick={() => void refreshStockAwareViews(queryClient)}
            >
              <RefreshCw size={14} />
              Sync
            </button>
          </div>
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Alert</th>
              </tr>
            </thead>
            <tbody>
              {stock.isLoading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={4}>
                    Loading stock balances...
                  </td>
                </tr>
              ) : stock.error ? (
                <tr>
                  <td className="px-4 py-8 text-center text-rose" colSpan={4}>
                    Stock balances could not load. Press Sync or restart the app.
                  </td>
                </tr>
              ) : stock.data?.items.length ? (
                stock.data.items.map((item) => {
                  const isLow = item.quantity <= item.product.minimumStock;
                  return (
                    <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3 font-semibold">{item.product.name}</td>
                      <td className="px-4 py-3">{item.warehouse.name}</td>
                      <td className="px-4 py-3">
                        {item.quantity} {item.product.inventoryUnit.toLowerCase()}
                      </td>
                      <td className="px-4 py-3">{isLow ? (item.quantity <= 0 ? "Out of stock" : "Low stock") : "OK"}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={4}>
                    No stock balances yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h3 className="font-bold">Stock History</h3>
          </div>
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Qty</th>
              </tr>
            </thead>
            <tbody>
              {movements.data?.items.length ? (
                movements.data.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold">{item.product.name}</td>
                    <td className="px-4 py-3">{item.type}</td>
                    <td className="px-4 py-3">{item.quantity}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={4}>
                    No stock movement history yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
}
