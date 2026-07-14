import {
  AlertTriangle,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  History,
  PencilLine,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInventoryImportPreset,
  deleteInventoryImportPreset,
  downloadInventoryImportReport,
  executeInventoryImport,
  fetchInventoryImport,
  fetchInventoryImportPresets,
  fetchInventoryImports,
  fetchProducts,
  previewInventoryImport,
  rollbackInventoryImport,
  type InventoryImportDuplicateAction,
  type InventoryImportMode,
  type InventoryImportPreview,
  type InventoryImportRequest,
  type Warehouse
} from "../../lib/api";
import { refreshStockAwareViews } from "../../lib/realtime";

type SourceRow = Record<string, unknown>;

const importFields = [
  ["productId", "Product ID", ["product id", "id"]],
  ["sku", "SKU", ["sku", "item code", "product code"]],
  ["barcode", "Barcode", ["barcode", "bar code", "ean", "upc"]],
  ["name", "Product Name", ["name", "product", "product name", "item"]],
  ["description", "Description", ["description", "details"]],
  ["category", "Category", ["category", "department"]],
  ["brand", "Brand", ["brand", "manufacturer"]],
  ["supplier", "Supplier", ["supplier", "vendor"]],
  ["inventoryUnit", "Stock Unit", ["stock unit", "inventory unit", "unit"]],
  ["sellingUnit", "Selling Unit", ["selling unit", "sale unit"]],
  ["variant", "Variant", ["variant", "option", "size"]],
  ["salesChannel", "Product Channel", ["product channel", "sales channel", "mode"]],
  ["unitRatioToBase", "Unit Ratio", ["unit ratio", "ratio"]],
  ["packageSize", "Package Size", ["package size", "pack size"]],
  ["costPrice", "Cost Price", ["cost price", "cost"]],
  ["retailPrice", "Selling Price", ["selling price", "retail price", "retail", "price"]],
  ["wholesalePrice", "Wholesale Price", ["wholesale price", "wholesale"]],
  ["vipPrice", "VIP Price", ["vip price", "special price"]],
  ["stock", "Stock", ["stock", "initial stock", "quantity", "qty"]],
  ["minimumStock", "Low Stock Alert", ["low stock alert", "minimum stock", "reorder point"]],
  ["taxRate", "Tax", ["tax", "tax rate", "vat"]],
  ["status", "Status", ["status"]],
  ["expiresAt", "Expiration Date", ["expiration date", "expiry", "expires at"]],
  ["batchNumber", "Batch", ["batch", "batch number"]],
  ["branch", "Branch", ["branch", "warehouse"]],
  ["location", "Location", ["location", "shelf"]],
  ["notes", "Notes", ["notes", "remarks"]]
] as const;

const modes: Array<{ value: InventoryImportMode; label: string; description: string }> = [
  { value: "ADD_NEW", label: "Add new products", description: "Creates new products and skips existing matches." },
  { value: "UPDATE_EXISTING", label: "Update existing products", description: "Updates matched product details without changing stock." },
  { value: "ADD_AND_UPDATE", label: "Add and update products", description: "Creates new products and updates explicit matches." },
  { value: "ADD_STOCK", label: "Add stock", description: "Adds the spreadsheet quantity to current stock." },
  { value: "REPLACE_STOCK", label: "Replace stock", description: "Sets current stock to the spreadsheet quantity." },
  { value: "ADJUST_STOCK", label: "Stock adjustment", description: "Applies a positive or negative stock difference." },
  { value: "INITIAL_INVENTORY", label: "Initial inventory", description: "Creates or updates products and sets opening stock." }
];

const manualHeaders = ["Product Name", "SKU", "Barcode", "Variant", "Cost Price", "Selling Price", "Wholesale Price", "Stock", "Low Stock Alert"];

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function detectImportMapping(headers: string[]) {
  return Object.fromEntries(
    headers.map((header) => {
      const normalized = normalizeHeader(header);
      const field = importFields.find((candidate) => candidate[2].some((alias) => normalizeHeader(alias) === normalized));
      return [header, field?.[0] ?? ""];
    })
  );
}

export function mapInventoryImportRows(rows: SourceRow[], headers: string[], mapping: Record<string, string>) {
  return rows.map((source, index) => {
    const target: Record<string, unknown> = { rowNumber: index + 2 };
    for (const header of headers) {
      const key = mapping[header];
      if (key) target[key] = source[header];
    }
    return target as InventoryImportRequest["rows"][number];
  });
}

async function hashFile(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function countBox(label: string, value: number, color: string) {
  return (
    <div className="min-w-28 border-r border-slate-200 px-4 py-3 last:border-r-0 dark:border-slate-700">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className={"mt-1 text-xl font-bold " + color}>{value.toLocaleString(undefined, { maximumFractionDigits: 3 })}</p>
    </div>
  );
}

export function InventoryImportPanel({ warehouses, defaultWarehouseId }: { warehouses: Warehouse[]; defaultWarehouseId: string }) {
  const queryClient = useQueryClient();
  const [entryMode, setEntryMode] = useState<"FILE" | "PASTE" | "MANUAL">("FILE");
  const [mode, setMode] = useState<InventoryImportMode>("ADD_AND_UPDATE");
  const [duplicateAction, setDuplicateAction] = useState<InventoryImportDuplicateAction>("MANUAL_REVIEW");
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [source, setSource] = useState<{ name: string; sizeBytes?: number; fingerprint?: string }>({ name: "manual-entry.xlsx" });
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<InventoryImportPreview | null>(null);
  const [filter, setFilter] = useState<"ALL" | "VALID" | "WARNING" | "INVALID">("ALL");
  const [confirming, setConfirming] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!warehouseId && defaultWarehouseId) setWarehouseId(defaultWarehouseId);
  }, [defaultWarehouseId, warehouseId]);

  const history = useQuery({ queryKey: ["inventory-imports"], queryFn: fetchInventoryImports });
  const presets = useQuery({ queryKey: ["inventory-import-presets"], queryFn: fetchInventoryImportPresets });
  const detail = useQuery({
    queryKey: ["inventory-import", selectedBatchId],
    queryFn: () => fetchInventoryImport(selectedBatchId),
    enabled: Boolean(selectedBatchId)
  });
  const request = useMemo<InventoryImportRequest>(
    () => ({ warehouseId, mode, duplicateAction, source, rows: mapInventoryImportRows(rows, headers, mapping) }),
    [duplicateAction, headers, mapping, mode, rows, source, warehouseId]
  );
  const filteredRows = preview?.rows.filter((row) => filter === "ALL" || row.status === filter) ?? [];

  const previewMutation = useMutation({
    mutationFn: () => previewInventoryImport(request),
    onSuccess: (result) => setPreview(result)
  });
  const executeMutation = useMutation({
    mutationFn: () => executeInventoryImport({ ...request, previewFingerprint: preview?.fingerprint ?? "" }),
    onSuccess: async (batch) => {
      setConfirming(false);
      setPreview(null);
      setSelectedBatchId(batch.id);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["inventory-imports"] }), refreshStockAwareViews(queryClient)]);
    }
  });
  const rollbackMutation = useMutation({
    mutationFn: rollbackInventoryImport,
    onSuccess: async (batch) => {
      setSelectedBatchId(batch.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-imports"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-import", batch.id] }),
        refreshStockAwareViews(queryClient)
      ]);
    }
  });
  const createPresetMutation = useMutation({
    mutationFn: createInventoryImportPreset,
    onSuccess: async () => {
      setPresetName("");
      await queryClient.invalidateQueries({ queryKey: ["inventory-import-presets"] });
    }
  });
  const deletePresetMutation = useMutation({
    mutationFn: deleteInventoryImportPreset,
    onSuccess: async () => {
      setSelectedPresetId("");
      await queryClient.invalidateQueries({ queryKey: ["inventory-import-presets"] });
    }
  });

  function replaceSource(nextHeaders: string[], nextRows: SourceRow[], nextSource: typeof source) {
    setHeaders(nextHeaders);
    setRows(nextRows);
    setMapping(detectImportMapping(nextHeaders));
    setSource(nextSource);
    setPreview(null);
  }

  async function loadFile(file: File) {
    const buffer = await file.arrayBuffer();
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const worksheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!worksheet) throw new Error("The file does not contain a readable worksheet.");
    const parsed = XLSX.utils.sheet_to_json<SourceRow>(worksheet, { defval: "", raw: false });
    const nextRows = parsed.filter((row) => Object.values(row).some((value) => String(value).trim()));
    const nextHeaders = Array.from(new Set(nextRows.flatMap((row) => Object.keys(row))));
    replaceSource(nextHeaders, nextRows, { name: file.name, sizeBytes: file.size, fingerprint: await hashFile(buffer) });
  }

  function loadPaste() {
    const lines = pasteText.split(/\r?\n/).map((line) => line.split("\t")).filter((line) => line.some((cell) => cell.trim()));
    const [headerRow, ...dataRows] = lines;
    if (!headerRow || dataRows.length === 0) return;
    const nextHeaders = headerRow.map((header, index) => header.trim() || "Column " + (index + 1));
    const nextRows = dataRows.map((cells) => Object.fromEntries(nextHeaders.map((header, index) => [header, cells[index] ?? ""])));
    replaceSource(nextHeaders, nextRows, { name: "pasted-spreadsheet.tsv" });
  }

  function startManual() {
    replaceSource(
      manualHeaders,
      Array.from({ length: 5 }, () => Object.fromEntries(manualHeaders.map((header) => [header, ""]))),
      { name: "manual-entry.xlsx" }
    );
  }

  function updateCell(rowIndex: number, header: string, value: string) {
    setRows((current) => current.map((row, index) => (index === rowIndex ? { ...row, [header]: value } : row)));
    setPreview(null);
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([
      importFields.map((field) => field[1]),
      ["", "STEEL-10", "123456789012", "Steel Bar", "", "Construction", "", "", "Piece", "Piece", "10mm", "Retail", 1, 1, 180, 220, 200, 200, 25, 5, 0, "Active", "", "", "MAIN", "Rack A", ""]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Inventory Import");
    XLSX.writeFile(workbook, "WholesalePOS-inventory-import-template.xlsx");
  }

  async function exportProducts() {
    const productList = await fetchProducts("", 1000);
    const XLSX = await import("xlsx");
    const exportRows = productList.items.map((product) => ({
      "Product ID": product.id,
      SKU: product.sku,
      Barcode: product.barcodes.find((barcode) => barcode.isPrimary)?.value ?? product.barcodes[0]?.value ?? "",
      "Product Name": product.name,
      Variant: product.variant ?? "",
      "Product Channel": product.salesChannel,
      Brand: product.brand ?? "",
      "Stock Unit": product.inventoryUnit,
      "Selling Unit": product.sellingUnit,
      "Cost Price": product.costPrice,
      "Selling Price": product.retailPrice,
      "Wholesale Price": product.wholesalePrice,
      Stock: product.stocks.reduce((total, stock) => total + stock.quantity, 0),
      "Low Stock Alert": product.minimumStock,
      Status: product.status
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), "Products");
    XLSX.writeFile(workbook, "WholesalePOS-products.xlsx");
  }

  async function downloadErrors() {
    if (!preview) return;
    const XLSX = await import("xlsx");
    const errorRows = preview.rows.filter((row) => row.status !== "VALID").map((row) => ({
      Row: row.rowNumber,
      Status: row.status,
      Action: row.action,
      Product: String(row.normalized.name ?? ""),
      SKU: String(row.normalized.sku ?? ""),
      Warnings: row.warnings.join("; "),
      Errors: row.errors.join("; ")
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(errorRows), "Import Issues");
    XLSX.writeFile(workbook, "WholesalePOS-import-errors.xlsx");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div>
          <h3 className="font-bold">Advanced Inventory Import</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Every row is previewed before products or stock change.</p>
        </div>
        <div className="flex gap-2">
          <button className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold dark:border-slate-700" onClick={() => void exportProducts()}>
            <Download size={17} /> Export
          </button>
          <button className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold dark:border-slate-700" onClick={() => void downloadTemplate()}>
            <FileSpreadsheet size={17} /> Template
          </button>
        </div>
      </header>

      <div className="grid border-b border-slate-200 dark:border-slate-800 lg:grid-cols-[190px_1fr]">
        <div className="grid content-start gap-1 border-b border-slate-200 p-4 dark:border-slate-800 lg:border-b-0 lg:border-r">
          {([
            ["FILE", FileSpreadsheet, "Excel / CSV"],
            ["PASTE", ClipboardPaste, "Paste rows"],
            ["MANUAL", PencilLine, "Manual grid"]
          ] as const).map(([value, Icon, label]) => (
            <button
              key={value}
              className={"focus-ring flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold " + (entryMode === value ? "bg-ocean text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800")}
              onClick={() => {
                setEntryMode(value);
                if (value === "MANUAL" && rows.length === 0) startManual();
              }}
            >
              <Icon size={17} /> {label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {entryMode === "FILE" ? (
            <div
              className={"flex min-h-36 items-center justify-center border-2 border-dashed p-4 text-center " + (dragging ? "border-ocean bg-ocean/5" : "border-slate-300 dark:border-slate-700")}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <label className="focus-ring cursor-pointer">
                <Upload className="mx-auto text-ocean" size={28} />
                <span className="mt-2 block text-sm font-bold">Drop Excel or CSV here</span>
                <span className="mt-1 block text-xs text-slate-500">or choose a file</span>
                <input className="sr-only" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadFile(file);
                  event.currentTarget.value = "";
                }} />
              </label>
            </div>
          ) : null}
          {entryMode === "PASTE" ? (
            <div className="space-y-3">
              <textarea className="focus-ring min-h-36 w-full rounded-md border border-slate-200 p-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-800" placeholder="Paste rows including headers" value={pasteText} onChange={(event) => setPasteText(event.target.value)} />
              <button className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-ocean px-4 text-sm font-bold text-white" onClick={loadPaste}>
                <ClipboardPaste size={17} /> Load Rows
              </button>
            </div>
          ) : null}
          {entryMode === "MANUAL" && rows.length === 0 ? (
            <button className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-ocean px-4 text-sm font-bold text-white" onClick={startManual}>
              <PencilLine size={17} /> Start Grid
            </button>
          ) : null}
          {rows.length > 0 ? <p className="mt-3 text-sm font-semibold">{source.name} · {rows.length.toLocaleString()} rows</p> : null}
        </div>
      </div>

      {headers.length > 0 ? (
        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h4 className="text-sm font-bold">Column Mapping</h4>
            <div className="flex flex-wrap items-end gap-2">
              <select className="focus-ring h-10 rounded-md border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={selectedPresetId} onChange={(event) => {
                setSelectedPresetId(event.target.value);
                const preset = presets.data?.find((item) => item.id === event.target.value);
                if (preset) {
                  setMapping(preset.mapping);
                  setPreview(null);
                }
              }}>
                <option value="">Mapping preset</option>
                {presets.data?.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </select>
              <input className="focus-ring h-10 w-40 rounded-md border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800" placeholder="Preset name" value={presetName} onChange={(event) => setPresetName(event.target.value)} />
              <button className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700" title="Save mapping preset" disabled={presetName.trim().length < 2} onClick={() => createPresetMutation.mutate({ name: presetName, mapping })}>
                <Save size={17} />
              </button>
              <button className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-rose disabled:opacity-40 dark:border-slate-700" title="Delete mapping preset" disabled={!selectedPresetId} onClick={() => {
                if (selectedPresetId && window.confirm("Delete this mapping preset?")) deletePresetMutation.mutate(selectedPresetId);
              }}>
                <Trash2 size={17} />
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {headers.map((header) => (
              <label key={header} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {header}
                <select className="focus-ring mt-1 h-10 w-full rounded-md border border-slate-200 px-2 text-sm dark:border-slate-700 dark:bg-slate-800" value={mapping[header] ?? ""} onChange={(event) => {
                  setMapping((current) => ({ ...current, [header]: event.target.value }));
                  setPreview(null);
                }}>
                  <option value="">Ignore column</option>
                  {importFields.map((field) => <option key={field[0]} value={field[0]}>{field[1]}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="grid gap-3 lg:grid-cols-4">
            <label className="text-sm font-semibold">
              Import mode
              <select className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={mode} onChange={(event) => {
                setMode(event.target.value as InventoryImportMode);
                setPreview(null);
              }}>
                {modes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Warehouse
              <select className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={warehouseId} onChange={(event) => {
                setWarehouseId(event.target.value);
                setPreview(null);
              }}>
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Name-only matches
              <select className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={duplicateAction} onChange={(event) => {
                setDuplicateAction(event.target.value as InventoryImportDuplicateAction);
                setPreview(null);
              }}>
                <option value="MANUAL_REVIEW">Manual review</option>
                <option value="SKIP">Skip</option>
                <option value="UPDATE">Update confirmed match</option>
                <option value="MERGE">Merge barcode and update</option>
              </select>
            </label>
            <button className="focus-ring mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ocean px-4 text-sm font-bold text-white disabled:opacity-50" disabled={!warehouseId || previewMutation.isPending || executeMutation.isPending} onClick={() => previewMutation.mutate()}>
              <Upload size={17} /> {previewMutation.isPending ? "Validating..." : "Preview Import"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">{modes.find((option) => option.value === mode)?.description}</p>
          {previewMutation.error ? <p className="mt-3 rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose">{previewMutation.error.message}</p> : null}
          <div className="mt-4 max-h-72 overflow-auto border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <tr><th className="px-3 py-2">Row</th>{headers.map((header) => <th key={header} className="px-3 py-2">{header}</th>)}<th className="w-12 px-2 py-2" /></tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-semibold">{rowIndex + 2}</td>
                    {headers.map((header) => <td key={header} className="p-1"><input className="focus-ring h-9 min-w-28 w-full border border-transparent bg-transparent px-2 hover:border-slate-200 focus:border-ocean" value={String(row[header] ?? "")} onChange={(event) => updateCell(rowIndex, header, event.target.value)} /></td>)}
                    <td className="p-1"><button className="focus-ring inline-flex h-9 w-9 items-center justify-center text-rose" title="Remove row" onClick={() => {
                      setRows((current) => current.filter((_item, index) => index !== rowIndex));
                      setPreview(null);
                    }}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="focus-ring mt-3 h-9 rounded-md border border-slate-200 px-3 text-sm font-bold dark:border-slate-700" onClick={() => {
            setRows((current) => [...current, Object.fromEntries(headers.map((header) => [header, ""]))]);
            setPreview(null);
          }}>Add row</button>
        </div>
      ) : null}

      {preview ? (
        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex flex-wrap overflow-hidden border border-slate-200 dark:border-slate-700">
            {countBox("Rows", preview.summary.rowCount, "")}
            {countBox("Valid", preview.summary.validCount, "text-mint")}
            {countBox("Warnings", preview.summary.warningCount, "text-amber-600")}
            {countBox("Invalid", preview.summary.invalidCount, "text-rose")}
            {countBox("Create", preview.summary.createCount, "text-ocean")}
            {countBox("Update", preview.summary.updateCount, "text-ocean")}
            {countBox("Stock", preview.summary.stockDelta, "")}
          </div>
          {preview.duplicateBatch ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Duplicate of batch {preview.duplicateBatch.id} imported {new Date(preview.duplicateBatch.createdAt).toLocaleString()}.</p> : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1">{(["ALL", "VALID", "WARNING", "INVALID"] as const).map((value) => <button key={value} className={"focus-ring h-9 rounded-md px-3 text-xs font-bold " + (filter === value ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "border border-slate-200 dark:border-slate-700")} onClick={() => setFilter(value)}>{value}</button>)}</div>
            <div className="flex gap-2">
              <button className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold dark:border-slate-700" onClick={() => void downloadErrors()}><Download size={16} /> Error Report</button>
              <button className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-mint px-4 text-sm font-bold text-white disabled:opacity-50" disabled={preview.summary.createCount + preview.summary.updateCount + preview.summary.stockCount === 0 || Boolean(preview.duplicateBatch)} onClick={() => setConfirming(true)}><Upload size={16} /> Continue</button>
            </div>
          </div>
          <div className="mt-3 max-h-80 overflow-auto border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Match</th><th className="px-3 py-2">Stock</th><th className="px-3 py-2">Details</th></tr></thead>
              <tbody>{filteredRows.map((row) => <tr key={row.rowNumber} className="border-t border-slate-100 align-top dark:border-slate-800"><td className="px-3 py-3 font-semibold">{row.rowNumber}</td><td className={"px-3 py-3 font-bold " + (row.status === "VALID" ? "text-mint" : row.status === "WARNING" ? "text-amber-600" : "text-rose")}>{row.status}</td><td className="px-3 py-3">{row.action}</td><td className="px-3 py-3 font-semibold">{String(row.normalized.name ?? row.matchedProduct?.name ?? "-")}</td><td className="px-3 py-3">{String(row.normalized.sku ?? row.matchedProduct?.sku ?? "-")}</td><td className="px-3 py-3">{row.matchMethod ?? "-"}</td><td className="px-3 py-3">{row.stockDelta}</td><td className="max-w-sm px-3 py-3 text-xs">{[...row.warnings, ...row.errors].join(" ") || "Ready"}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="p-5">
        <div className="flex items-center gap-2"><History size={18} /><h4 className="font-bold">Import History</h4></div>
        <div className="mt-3 overflow-auto border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Created</th><th className="px-3 py-2">Updated</th><th className="px-3 py-2">Failed</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Actions</th></tr></thead>
            <tbody>{history.data?.items.map((batch) => <tr key={batch.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-3 py-3">{new Date(batch.createdAt).toLocaleString()}</td><td className="px-3 py-3 font-mono text-xs">{batch.id.slice(-8)}</td><td className="px-3 py-3 font-semibold">{batch.sourceName}</td><td className="px-3 py-3">{batch.mode.replaceAll("_", " ")}</td><td className="px-3 py-3">{batch.createdBy.name}</td><td className="px-3 py-3">{batch.createdCount}</td><td className="px-3 py-3">{batch.updatedCount}</td><td className="px-3 py-3">{batch.failedCount}</td><td className="px-3 py-3 font-bold">{batch.status}</td><td className="px-3 py-3"><div className="flex gap-1"><button className="focus-ring h-8 rounded-md border border-slate-200 px-2 text-xs font-bold dark:border-slate-700" onClick={() => setSelectedBatchId(batch.id)}>Details</button><button className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700" title="Download report" onClick={() => void downloadInventoryImportReport(batch.id).then((blob) => downloadBlob(blob, "inventory-import-" + batch.id + ".csv"))}><Download size={15} /></button>{["COMPLETED", "PARTIAL"].includes(batch.status) ? <button className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-rose dark:border-slate-700" title="Rollback import" onClick={() => {
                if (window.confirm("Rollback this import? This is allowed only when no later product or stock activity depends on it.")) rollbackMutation.mutate(batch.id);
              }}><RotateCcw size={15} /></button> : null}</div></td></tr>)}</tbody>
          </table>
        </div>
        {rollbackMutation.error ? <p className="mt-3 rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose">{rollbackMutation.error.message}</p> : null}
        {detail.data?.rows ? (
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
            <div className="flex items-center justify-between"><p className="font-bold">Batch {detail.data.id}</p><button className="focus-ring inline-flex h-8 w-8 items-center justify-center" title="Close details" onClick={() => setSelectedBatchId("")}><X size={18} /></button></div>
            <div className="mt-3 max-h-64 overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Before</th><th className="px-3 py-2">After</th><th className="px-3 py-2">Issues</th></tr></thead><tbody>{detail.data.rows.map((row) => <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2 font-bold">{row.status}</td><td className="px-3 py-2">{row.product?.name ?? "-"}</td><td className="px-3 py-2">{row.action}</td><td className="px-3 py-2">{row.previousStock ?? "-"}</td><td className="px-3 py-2">{row.newStock ?? "-"}</td><td className="px-3 py-2 text-xs">{[...(row.warnings ?? []), ...(row.errors ?? [])].join(" ") || "-"}</td></tr>)}</tbody></table></div>
          </div>
        ) : null}
      </div>

      {confirming && preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-import-title">
          <div className="w-full max-w-lg rounded-md bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-center gap-3"><AlertTriangle className="text-amber-600" /><h3 id="confirm-import-title" className="text-lg font-bold">Confirm Inventory Import</h3></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><p><strong>{preview.summary.createCount}</strong> products created</p><p><strong>{preview.summary.updateCount}</strong> products updated</p><p><strong>{preview.summary.stockDelta}</strong> stock change</p><p><strong>{preview.summary.skippedCount}</strong> rows skipped</p></div>
            {executeMutation.error ? <p className="mt-3 rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose">{executeMutation.error.message}</p> : null}
            <div className="mt-6 flex justify-end gap-2"><button className="focus-ring h-10 rounded-md border border-slate-200 px-4 text-sm font-bold dark:border-slate-700" disabled={executeMutation.isPending} onClick={() => setConfirming(false)}>Cancel</button><button className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-mint px-4 text-sm font-bold text-white disabled:opacity-50" disabled={executeMutation.isPending} onClick={() => executeMutation.mutate()}><Upload size={17} />{executeMutation.isPending ? "Importing..." : "Confirm Import"}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
