import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProduct, fetchProducts, type ProductCreatePayload } from "../lib/api";
import { formatCurrency } from "../lib/currency";

const emptyProduct: ProductCreatePayload = {
  sku: "",
  name: "",
  brand: "",
  barcode: "",
  costPrice: 0,
  retailPrice: 0,
  wholesalePrice: 0,
  minimumStock: 0
};

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [product, setProduct] = useState<ProductCreatePayload>(emptyProduct);
  const products = useQuery({
    queryKey: ["products", search],
    queryFn: () => fetchProducts(search)
  });

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async () => {
      setProduct(emptyProduct);
      setIsAdding(false);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  });

  const productCount = useMemo(() => products.data?.pagination.total ?? 0, [products.data?.pagination.total]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Inventory Control</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{productCount} products saved on this device.</p>
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
            SKU
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              value={product.sku}
              onChange={(event) => setProduct((current) => ({ ...current, sku: event.target.value }))}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            Barcode
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
            Cost price
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="number"
              min="0"
              step="0.01"
              value={product.costPrice}
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
              onChange={(event) => setProduct((current) => ({ ...current, wholesalePrice: Number(event.target.value) }))}
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

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Barcode</th>
              <th className="px-4 py-3">Retail</th>
              <th className="px-4 py-3">Wholesale</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.isLoading ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={6}>
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
                  <td className="px-4 py-3">{formatCurrency(item.retailPrice)}</td>
                  <td className="px-4 py-3">{formatCurrency(item.wholesalePrice)}</td>
                  <td className="px-4 py-3">{item.status}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={6}>
                  No products yet. Add your first product to start using inventory.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
