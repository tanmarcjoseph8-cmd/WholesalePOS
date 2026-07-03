import { Minus, Plus, ScanBarcode, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSale, fetchProducts, fetchStock, fetchWarehouses, type Product } from "../lib/api";
import { formatCurrency } from "../lib/currency";

type CartItem = {
  product: Product;
  warehouseId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

export function PosPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cashAmount, setCashAmount] = useState(0);
  const [gcashAmount, setGcashAmount] = useState(0);
  const [gcashReference, setGcashReference] = useState("");
  const products = useQuery({ queryKey: ["pos-products", search], queryFn: () => fetchProducts(search) });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: fetchWarehouses });
  const stock = useQuery({ queryKey: ["stock", search], queryFn: () => fetchStock(search) });
  const defaultWarehouseId = warehouses.data?.[0]?.id ?? "";

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), [cart]);
  const discountTotal = useMemo(() => cart.reduce((sum, item) => sum + item.discount, 0), [cart]);
  const total = Math.max(0, subtotal - discountTotal);
  const paid = cashAmount + gcashAmount;
  const change = Math.max(0, paid - total);

  const checkout = useMutation({
    mutationFn: () =>
      createSale({
        items: cart.map((item) => ({
          productId: item.product.id,
          warehouseId: item.warehouseId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount
        })),
        payments: [
          ...(cashAmount > 0 ? [{ method: "CASH" as const, amount: cashAmount, reference: null }] : []),
          ...(gcashAmount > 0 ? [{ method: "GCASH" as const, amount: gcashAmount, reference: gcashReference || null }] : [])
        ]
      }),
    onSuccess: async () => {
      setCart([]);
      setCashAmount(0);
      setGcashAmount(0);
      setGcashReference("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["stock"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements"] })
      ]);
    }
  });

  function addProduct(product: Product) {
    if (!defaultWarehouseId) return;
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) => (item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...current, { product, warehouseId: defaultWarehouseId, quantity: 1, unitPrice: product.retailPrice, discount: 0 }];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((item) => (item.product.id === productId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  return (
    <section className="grid min-h-[calc(100vh-8rem)] gap-4 xl:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">Point of Sale</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Search, scan, add to cart, and checkout.</p>
            </div>
          </div>
          <div className="relative mt-5">
            <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
            <input
              className="focus-ring h-12 w-full rounded-md border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-800"
              placeholder="Scan barcode or search product"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.data?.items.map((product) => {
            const stockRow = stock.data?.items.find((item) => item.productId === product.id);
            return (
              <button
                key={product.id}
                className="focus-ring rounded-md border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900"
                onClick={() => addProduct(product)}
              >
                <div className="font-bold">{product.name}</div>
                <div className="mt-1 text-xs text-slate-500">{product.sku}</div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span>{formatCurrency(product.retailPrice)}</span>
                  <span>{stockRow ? `${stockRow.quantity} left` : "No stock"}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-lg font-bold">Current Cart</h3>
        <div className="mt-5 max-h-80 space-y-3 overflow-auto">
          {cart.length ? (
            cart.map((item) => (
              <div key={item.product.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{item.product.name}</div>
                    <div className="text-xs text-slate-500">{formatCurrency(item.unitPrice)} each</div>
                  </div>
                  <button className="focus-ring rounded-md p-2" onClick={() => setCart((current) => current.filter((cartItem) => cartItem.product.id !== item.product.id))}>
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button className="focus-ring rounded-md border border-slate-200 p-2 dark:border-slate-700" onClick={() => updateQuantity(item.product.id, -1)}>
                      <Minus size={16} />
                    </button>
                    <span className="w-10 text-center font-bold">{item.quantity}</span>
                    <button className="focus-ring rounded-md border border-slate-200 p-2 dark:border-slate-700" onClick={() => updateQuantity(item.product.id, 1)}>
                      <Plus size={16} />
                    </button>
                  </div>
                  <strong>{formatCurrency(item.unitPrice * item.quantity - item.discount)}</strong>
                </div>
              </div>
            ))
          ) : (
            <div className="grid h-40 place-items-center rounded-md border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No items added.
            </div>
          )}
        </div>

        <div className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <strong>{formatCurrency(subtotal)}</strong>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <strong>{formatCurrency(discountTotal)}</strong>
          </div>
          <div className="flex justify-between text-lg">
            <span>Total</span>
            <strong>{formatCurrency(total)}</strong>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <label className="text-sm font-semibold">
            Cash
            <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" type="number" min="0" step="0.01" value={cashAmount} onChange={(event) => setCashAmount(Number(event.target.value))} />
          </label>
          <label className="text-sm font-semibold">
            GCash
            <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" type="number" min="0" step="0.01" value={gcashAmount} onChange={(event) => setGcashAmount(Number(event.target.value))} />
          </label>
          <label className="text-sm font-semibold">
            GCash reference
            <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={gcashReference} onChange={(event) => setGcashReference(event.target.value)} />
          </label>
        </div>

        <div className="mt-5 flex justify-between text-sm">
          <span>Change</span>
          <strong>{formatCurrency(change)}</strong>
        </div>
        {checkout.error ? <p className="mt-3 rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose">{checkout.error.message}</p> : null}
        <button className="focus-ring mt-5 w-full rounded-md bg-mint px-4 py-3 text-sm font-bold text-white" disabled={!cart.length || paid < total || checkout.isPending} onClick={() => checkout.mutate()}>
          {checkout.isPending ? "Completing..." : "Checkout"}
        </button>
      </aside>
    </section>
  );
}
