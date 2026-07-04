import { Plus, Search } from "lucide-react";
import type { FocusEvent } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adjustInventoryCount,
  createInventoryMovement,
  createProduct,
  fetchInventoryMovements,
  fetchProducts,
  fetchStock,
  fetchWarehouses,
  type ProductCreatePayload
} from "../lib/api";
import { formatCurrency } from "../lib/currency";

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
  { value: "CENTIMETER", label: "Centimeter" },
  { value: "PACK", label: "Pack" },
  { value: "CASE", label: "Case" },
  { value: "BUNDLE", label: "Bundle" },
  { value: "BOTTLE", label: "Bottle" },
  { value: "ROLL", label: "Roll" }
];

function selectInputValue(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [product, setProduct] = useState<ProductCreatePayload>(emptyProduct);
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
    queryFn: () => fetchProducts("")
  });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: fetchWarehouses });
  const stock = useQuery({ queryKey: ["stock", search], queryFn: () => fetchStock(search) });
  const lowStock = useQuery({ queryKey: ["stock", "low"], queryFn: () => fetchStock("", true) });
  const movements = useQuery({ queryKey: ["inventory-movements"], queryFn: () => fetchInventoryMovements() });
  const defaultWarehouseId = warehouses.data?.[0]?.id ?? "";
  const selectedWarehouseId = stockForm.warehouseId || defaultWarehouseId;

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async (createdProduct) => {
      setProduct(emptyProduct);
      setIsAdding(false);
      setStockForm((current) => ({ ...current, productId: createdProduct.id }));
      setStockMessage(`${createdProduct.name} is selected for stock entry.`);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["stock"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements"] })
      ]);
    }
  });

  const productCount = useMemo(() => products.data?.pagination.total ?? 0, [products.data?.pagination.total]);
  const canSaveStock = Boolean(stockForm.productId && selectedWarehouseId && stockForm.quantity > 0 && stockForm.reason.trim().length >= 3);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Inventory Control</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {productCount} products saved on this device. {lowStock.data?.pagination.total ?? 0} low-stock alerts.
          </p>
        </div>
        <button className="focus-ring inline-flex items-center gap-2 rounded-md bg-ocean px-4 py-2 text-sm font-bold text-white" onClick={() => setIsAdding(true)}>
          <Plus size={18} />
          Add Product
        </button>
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
            {stockProducts.data?.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.sku})
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
            </tr>
          </thead>
          <tbody>
            {products.isLoading ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={7}>
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
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={7}>
                  No products yet. Add your first product to start using inventory.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h3 className="font-bold">Stock Balances</h3>
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
              {stock.data?.items.length ? (
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
