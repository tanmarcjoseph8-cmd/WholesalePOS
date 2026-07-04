import { Minus, Plus, Printer, ScanBarcode, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSale, fetchProducts, fetchSaleReceipt, fetchStock, fetchWarehouses, requestReceiptPrint, type Product } from "../lib/api";
import { formatCurrency } from "../lib/currency";
import { refreshStockAwareViews } from "../lib/realtime";

type CartItem = {
  product: Product;
  warehouseId: string;
  quantity: number;
  soldUnit: string;
  discount: number;
};

const unitDefinitions: Record<string, { group: string; factor: number; label: string }> = {
  KILOGRAM: { group: "weight", factor: 1, label: "kg" },
  GRAM: { group: "weight", factor: 0.001, label: "g" },
  LITER: { group: "volume", factor: 1, label: "L" },
  MILLILITER: { group: "volume", factor: 0.001, label: "mL" },
  METER: { group: "length", factor: 1, label: "m" },
  CENTIMETER: { group: "length", factor: 0.01, label: "cm" },
  PIECE: { group: "count", factor: 1, label: "pc" },
  PACK: { group: "count", factor: 1, label: "pack" },
  CASE: { group: "count", factor: 1, label: "case" },
  BUNDLE: { group: "count", factor: 1, label: "bundle" },
  BOTTLE: { group: "count", factor: 1, label: "bottle" },
  ROLL: { group: "count", factor: 1, label: "roll" },
  CUSTOM: { group: "custom", factor: 1, label: "unit" }
};

function compatibleUnits(inventoryUnit: string) {
  const base = unitDefinitions[inventoryUnit];
  if (!base) return [inventoryUnit];
  return Object.entries(unitDefinitions)
    .filter(([, definition]) => definition.group === base.group)
    .map(([unit]) => unit);
}

function unitLabel(unit: string) {
  return unitDefinitions[unit]?.label ?? unit.toLowerCase();
}

function toBaseQuantity(quantity: number, soldUnit: string, inventoryUnit: string) {
  const sold = unitDefinitions[soldUnit];
  const base = unitDefinitions[inventoryUnit];
  if (!sold || !base || sold.group !== base.group) return quantity;
  return (quantity * sold.factor) / base.factor;
}

function calculateLine(item: CartItem) {
  const packageSize = Math.max(item.product.packageSize, 0.001);
  const baseQuantity = toBaseQuantity(item.quantity, item.soldUnit, item.product.inventoryUnit);
  const threshold = Math.max(item.product.wholesaleThreshold, 0);
  const packagePrice = threshold > 0 && baseQuantity >= threshold ? item.product.wholesalePrice : item.product.retailPrice;
  const unitPrice = packagePrice / packageSize;
  const subtotal = unitPrice * baseQuantity;
  return { baseQuantity, unitPrice, subtotal, total: Math.max(0, subtotal - item.discount) };
}

export function PosPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cashAmount, setCashAmount] = useState(0);
  const [gcashAmount, setGcashAmount] = useState(0);
  const [gcashReference, setGcashReference] = useState("");
  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<"58mm" | "80mm">("80mm");
  const products = useQuery({ queryKey: ["pos-products", search], queryFn: () => fetchProducts(search) });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: fetchWarehouses });
  const stock = useQuery({ queryKey: ["stock", "pos-balances"], queryFn: () => fetchStock("") });
  const receipt = useQuery({
    queryKey: ["receipt", receiptSaleId, receiptPaperWidth],
    queryFn: () => fetchSaleReceipt({ saleId: receiptSaleId as string, paperWidth: receiptPaperWidth }),
    enabled: Boolean(receiptSaleId)
  });
  const defaultWarehouseId = warehouses.data?.[0]?.id ?? "";

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + calculateLine(item).subtotal, 0), [cart]);
  const discountTotal = useMemo(() => cart.reduce((sum, item) => sum + item.discount, 0), [cart]);
  const stockByProductId = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const item of stock.data?.items ?? []) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    return quantities;
  }, [stock.data?.items]);
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
          soldUnit: item.soldUnit,
          discount: item.discount
        })),
        payments: [
          ...(cashAmount > 0 ? [{ method: "CASH" as const, amount: cashAmount, reference: null }] : []),
          ...(gcashAmount > 0 ? [{ method: "GCASH" as const, amount: gcashAmount, reference: gcashReference || null }] : [])
        ]
      }),
    onSuccess: async (sale) => {
      setCart([]);
      setCashAmount(0);
      setGcashAmount(0);
      setGcashReference("");
      setReceiptSaleId(sale.id);
      await refreshStockAwareViews(queryClient);
    }
  });

  function addProduct(product: Product) {
    if (!defaultWarehouseId) return;
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) => (item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...current, { product, warehouseId: defaultWarehouseId, quantity: 1, soldUnit: product.sellingUnit, discount: 0 }];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((item) => (item.product.id === productId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  function setQuantity(productId: string, quantity: number) {
    setCart((current) =>
      current
        .map((item) => (item.product.id === productId ? { ...item, quantity: Math.max(0, quantity) } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  async function printReceipt() {
    if (!receiptSaleId) return;
    const printPayload = await requestReceiptPrint({
      saleId: receiptSaleId,
      paperWidth: receiptPaperWidth,
      printerType: "WINDOWS",
      printerName: "Windows default printer"
    });
    const printWindow = window.open("", "_blank", "width=420,height=720");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(printPayload.html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
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
          {products.isLoading ? (
            <div className="rounded-md border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Searching products...
            </div>
          ) : null}
          {products.error ? (
            <div className="rounded-md border border-rose/30 bg-rose/10 p-4 text-sm font-semibold text-rose sm:col-span-2 lg:col-span-3">
              Product search could not load. Please sign in again or restart the app.
            </div>
          ) : null}
          {stock.error ? (
            <div className="rounded-md border border-amber/30 bg-amber/10 p-4 text-sm font-semibold text-amber sm:col-span-2 lg:col-span-3">
              Stock balances could not load. Product cards may show 0 until the app reconnects.
            </div>
          ) : null}
          {!products.isLoading && !products.error && products.data?.items.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 sm:col-span-2 lg:col-span-3">
              No matching product found.
            </div>
          ) : null}
          {products.data?.items.map((product) => {
            const availableStock = stockByProductId.get(product.id) ?? 0;
            return (
              <button
                key={product.id}
                className="focus-ring rounded-md border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900"
                onClick={() => addProduct(product)}
              >
                <div className="font-bold">{product.name}</div>
                <div className="mt-1 text-xs text-slate-500">{product.sku}</div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span>
                    {formatCurrency(product.retailPrice)} / {product.packageSize} {unitLabel(product.inventoryUnit)}
                  </span>
                  <span>{stock.isLoading ? "Checking stock" : `${availableStock.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unitLabel(product.inventoryUnit)} left`}</span>
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
            cart.map((item) => {
              const line = calculateLine(item);
              const units = compatibleUnits(item.product.inventoryUnit);
              return (
              <div key={item.product.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{item.product.name}</div>
                    <div className="text-xs text-slate-500">
                      {formatCurrency(line.unitPrice)} per {unitLabel(item.product.inventoryUnit)}
                    </div>
                  </div>
                  <button className="focus-ring rounded-md p-2" onClick={() => setCart((current) => current.filter((cartItem) => cartItem.product.id !== item.product.id))}>
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button className="focus-ring rounded-md border border-slate-200 p-2 dark:border-slate-700" onClick={() => updateQuantity(item.product.id, -1)}>
                      <Minus size={16} />
                    </button>
                    <input
                      className="focus-ring h-10 w-20 rounded-md border border-slate-200 px-2 text-center font-bold dark:border-slate-700 dark:bg-slate-800"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantity}
                      onChange={(event) => setQuantity(item.product.id, Number(event.target.value))}
                    />
                    <button className="focus-ring rounded-md border border-slate-200 p-2 dark:border-slate-700" onClick={() => updateQuantity(item.product.id, 1)}>
                      <Plus size={16} />
                    </button>
                  </div>
                  <select
                    className="focus-ring h-10 rounded-md border border-slate-200 px-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    value={item.soldUnit}
                    onChange={(event) => setCart((current) => current.map((cartItem) => (cartItem.product.id === item.product.id ? { ...cartItem, soldUnit: event.target.value } : cartItem)))}
                  >
                    {units.map((unit) => (
                      <option key={unit} value={unit}>
                        {unitLabel(unit)}
                      </option>
                    ))}
                  </select>
                  <strong>{formatCurrency(line.total)}</strong>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Deducts {line.baseQuantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {unitLabel(item.product.inventoryUnit)} from stock.
                </div>
              </div>
            );
            })
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

      {receiptSaleId ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/60 p-4">
          <section className="max-h-[90vh] w-full max-w-xl overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
              <div>
                <h3 className="font-bold">Receipt</h3>
                <p className="text-sm text-slate-500">{receipt.data?.receiptNumber ?? "Loading..."}</p>
              </div>
              <button className="focus-ring rounded-md p-2" onClick={() => setReceiptSaleId(null)} aria-label="Close receipt">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
              <select
                className="focus-ring h-10 rounded-md border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                value={receiptPaperWidth}
                onChange={(event) => setReceiptPaperWidth(event.target.value as "58mm" | "80mm")}
              >
                <option value="80mm">80mm paper</option>
                <option value="58mm">58mm paper</option>
              </select>
              <button className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-ocean px-3 text-sm font-bold text-white" onClick={() => void printReceipt()} disabled={!receipt.data}>
                <Printer size={17} />
                Print
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto bg-slate-100 p-4 dark:bg-slate-950">
              {receipt.data ? (
                <div
                  className="mx-auto bg-white p-4 text-ink shadow-sm"
                  style={{ width: receiptPaperWidth === "58mm" ? "260px" : "360px" }}
                  dangerouslySetInnerHTML={{ __html: receipt.data.html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? receipt.data.html }}
                />
              ) : (
                <div className="grid h-48 place-items-center text-sm text-slate-500">Loading receipt...</div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
