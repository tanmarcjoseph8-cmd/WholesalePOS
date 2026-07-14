import {
  Armchair,
  Check,
  Clock3,
  CreditCard,
  Edit3,
  HandPlatter,
  LockKeyhole,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acquireRestaurantOrderLock,
  assignRestaurantOrderTables,
  cancelRestaurantOrder,
  checkoutRestaurantOrder,
  createRestaurantOrder,
  createRestaurantTable,
  disableRestaurantTable,
  fetchProducts,
  fetchRestaurantOrders,
  fetchRestaurantTables,
  fetchRuntimeSettings,
  fetchStock,
  fetchWarehouses,
  mergeRestaurantOrders,
  refundSale,
  releaseRestaurantOrderLock,
  reopenRestaurantOrder,
  restoreRestaurantTable,
  splitRestaurantOrder,
  undoRestaurantOrderItemChange,
  updateRestaurantOrder,
  updateRestaurantTable,
  voidSale,
  type Product,
  type RestaurantOrder,
  type RestaurantOrderItemInput,
  type RestaurantOrderStatus,
  type RestaurantOrderType,
  type RestaurantTable
} from "../lib/api";
import { formatCurrency } from "../lib/currency";

type EditorItem = RestaurantOrderItemInput & { id?: string; name: string; variant: string | null; inventoryUnit: string; taxRate: number };

const unitFactors: Record<string, { dimension: string; factor: number }> = {
  KILOGRAM: { dimension: "weight", factor: 1 },
  GRAM: { dimension: "weight", factor: 0.001 },
  LITER: { dimension: "volume", factor: 1 },
  MILLILITER: { dimension: "volume", factor: 0.001 },
  METER: { dimension: "length", factor: 1 },
  YARD: { dimension: "length", factor: 0.9144 },
  CENTIMETER: { dimension: "length", factor: 0.01 }
};

function baseQuantity(quantity: number, soldUnit: string | undefined, inventoryUnit: string) {
  const sold = unitFactors[soldUnit ?? inventoryUnit];
  const base = unitFactors[inventoryUnit];
  return sold && base && sold.dimension === base.dimension ? (quantity * sold.factor) / base.factor : quantity;
}

const tableTone: Record<RestaurantTable["status"], string> = {
  AVAILABLE: "border-mint/40 bg-mint/10 text-emerald-800 dark:text-emerald-200",
  OCCUPIED: "border-ocean/40 bg-ocean/10 text-ocean dark:text-sky-200",
  RESERVED: "border-violet-400/40 bg-violet-400/10 text-violet-700 dark:text-violet-200",
  AWAITING_ORDER: "border-amber/40 bg-amber/10 text-amber-800 dark:text-amber-200",
  PREPARING: "border-orange-400/40 bg-orange-400/10 text-orange-800 dark:text-orange-200",
  SERVED: "border-cyan-400/40 bg-cyan-400/10 text-cyan-800 dark:text-cyan-200",
  AWAITING_PAYMENT: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-800 dark:text-fuchsia-200",
  CLEANING: "border-slate-400 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
  UNAVAILABLE: "border-rose/40 bg-rose/10 text-rose"
};

const orderTypeLabels: Record<RestaurantOrderType, string> = {
  DINE_IN: "Dine in",
  WALK_IN: "Walk in",
  COUNTER: "Counter",
  TAKEOUT: "Takeout",
  PICKUP: "Pickup",
  DELIVERY: "Delivery",
  OTHER: "Other"
};

const nextOrderStatus: Partial<Record<RestaurantOrderStatus, RestaurantOrderStatus>> = {
  DRAFT: "OPEN",
  OPEN: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
  READY: "SERVED"
};
const closedOrderStatuses: RestaurantOrderStatus[] = ["COMPLETED", "CANCELLED"];

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function orderTypeLabel(order: Pick<RestaurantOrder, "orderType" | "customOrderType">) {
  return order.customOrderType || orderTypeLabels[order.orderType];
}

function productStock(product: Product) {
  return product.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
}

function orderToEditorItems(order: RestaurantOrder): EditorItem[] {
  return order.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    warehouseId: item.warehouseId ?? "",
    quantity: item.quantity,
    soldUnit: item.soldUnit,
    unitPrice: item.unitPrice,
    discount: item.discount,
    note: item.note,
    name: item.product.name,
    variant: item.product.variant,
    inventoryUnit: item.product.inventoryUnit,
    taxRate: item.product.taxRate
  }));
}

function TableDialog({
  table,
  onClose,
  onSaved
}: {
  table: RestaurantTable | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ number: table?.number ?? "", section: table?.section ?? "Main", capacity: table?.capacity ?? 2, status: table?.status ?? "AVAILABLE" as RestaurantTable["status"], notes: table?.notes ?? "" });
  const save = useMutation({
    mutationFn: () =>
      table
        ? updateRestaurantTable({ id: table.id, ...form, notes: form.notes || null })
        : createRestaurantTable({ ...form, notes: form.notes || null }),
    onSuccess: onSaved
  });
  const disable = useMutation({ mutationFn: () => disableRestaurantTable(table?.id ?? ""), onSuccess: onSaved });
  const restore = useMutation({ mutationFn: () => restoreRestaurantTable(table?.id ?? ""), onSuccess: onSaved });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label={table ? "Edit table" : "Add table"}>
      <form
        className="w-full max-w-md rounded-md border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{table ? `Edit table ${table.number}` : "Add table"}</h2>
          <button className="focus-ring grid h-9 w-9 place-items-center rounded-md" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Number
            <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.number} onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))} required />
          </label>
          <label className="text-sm font-semibold">
            Seats
            <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" type="number" min="1" max="100" value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: Number(event.target.value) }))} required />
          </label>
        </div>
        <label className="mt-4 block text-sm font-semibold">
          Section
          <input className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.section} onChange={(event) => setForm((current) => ({ ...current, section: event.target.value }))} required />
        </label>
        <label className="mt-4 block text-sm font-semibold">
          Notes
          <textarea className="focus-ring mt-2 min-h-20 w-full rounded-md border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-800" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
        </label>
        <label className="mt-4 block text-sm font-semibold">Status<select className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={form.status} disabled={Boolean(table?.activeOrder)} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as RestaurantTable["status"] }))}><option value="AVAILABLE">Available</option><option value="RESERVED">Reserved</option><option value="UNAVAILABLE">Unavailable</option></select></label>
        {save.error || disable.error || restore.error ? <p className="mt-3 rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose">{save.error?.message ?? disable.error?.message ?? restore.error?.message}</p> : null}
        <div className="mt-5 flex items-center justify-between gap-3">
          {table ? (
            table.isActive ? <button className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-rose/40 px-3 text-sm font-bold text-rose" type="button" disabled={disable.isPending || Boolean(table.activeOrder)} onClick={() => window.confirm("Deactivate this table? It will leave the active layout but remain in history.") && disable.mutate()}>
              <Trash2 size={16} /> Deactivate
            </button> : <button className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-mint/50 px-3 text-sm font-bold text-emerald-700" type="button" disabled={restore.isPending} onClick={() => restore.mutate()}>
              <RefreshCw size={16} /> Restore
            </button>
          ) : (
            <span />
          )}
          <button className="focus-ring h-10 rounded-md bg-ocean px-4 text-sm font-bold text-white" disabled={save.isPending || Boolean(table && !table.isActive)}>
            {save.isPending ? "Saving..." : "Save table"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function RestaurantPage({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"tables" | "orders">("tables");
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [includeInactiveTables, setIncludeInactiveTables] = useState(false);
  const [editingOrder, setEditingOrder] = useState<RestaurantOrder | null>(null);
  const [editorItems, setEditorItems] = useState<EditorItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [queueNumber, setQueueNumber] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [orderNote, setOrderNote] = useState("");
  const [cash, setCash] = useState(0);
  const [gcash, setGcash] = useState(0);
  const [gcashReference, setGcashReference] = useState("");
  const [newOrderType, setNewOrderType] = useState<RestaurantOrderType>("WALK_IN");
  const [newCustomOrderType, setNewCustomOrderType] = useState("");
  const [tableDialog, setTableDialog] = useState<RestaurantTable | "new" | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [primaryTableId, setPrimaryTableId] = useState("");
  const [completedReceipt, setCompletedReceipt] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitQuantities, setSplitQuantities] = useState<Record<string, number>>({});
  const [reversalKind, setReversalKind] = useState<"REFUND" | "VOID" | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [refundQuantities, setRefundQuantities] = useState<Record<string, number>>({});

  const canManageTables = permissions.includes("tables.manage");
  const canCancel = permissions.includes("orders.cancel");
  const canReopen = permissions.includes("orders.reopen");
  const canSplit = permissions.includes("orders.split-bill");
  const canRefund = permissions.includes("sales.refund");
  const canVoid = permissions.includes("sales.void");
  const tables = useQuery({ queryKey: ["restaurant", "tables", includeInactiveTables], queryFn: () => fetchRestaurantTables(includeInactiveTables) });
  const orders = useQuery({ queryKey: ["restaurant", "orders", search, includeClosed], queryFn: () => fetchRestaurantOrders({ search, includeClosed }) });
  const runtimeSettings = useQuery({ queryKey: ["settings", "runtime"], queryFn: fetchRuntimeSettings });
  const products = useQuery({ queryKey: ["restaurant", "products", productSearch], queryFn: () => fetchProducts(productSearch) });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: fetchWarehouses });
  const stock = useQuery({ queryKey: ["stock", "restaurant-balances"], queryFn: () => fetchStock("") });
  const restaurantProducts = products.data?.items ?? [];
  const availableByProductId = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const row of stock.data?.items ?? []) quantities.set(row.productId, (quantities.get(row.productId) ?? 0) + row.availableQuantity);
    return quantities;
  }, [stock.data?.items]);
  const activeTables = (tables.data ?? []).filter((table) => table.isActive);
  const inactiveTables = (tables.data ?? []).filter((table) => !table.isActive);
  const defaultWarehouseId = warehouses.data?.[0]?.id ?? "";
  const editorTotal = useMemo(
    () =>
      editorItems.reduce((sum, item) => {
        const taxable = Math.max(0, (item.unitPrice ?? 0) * baseQuantity(item.quantity, item.soldUnit, item.inventoryUnit) - item.discount);
        return sum + taxable + taxable * item.taxRate;
      }, 0),
    [editorItems]
  );

  useEffect(() => {
    if (!editingOrder) return;
    const current = orders.data?.items.find((order) => order.id === editingOrder.id);
    if (current?.version && current.version > editingOrder.version) setEditingOrder(current);
  }, [editingOrder, orders.data?.items]);

  function loadEditor(order: RestaurantOrder) {
    setEditingOrder(order);
    setEditorItems(orderToEditorItems(order));
    setCustomerName(order.customerName ?? "");
    setCustomerPhone(order.customerPhone ?? "");
    setQueueNumber(order.queueNumber ?? "");
    setGuestCount(order.guestCount);
    setOrderNote(order.note ?? "");
    setSelectedTableIds(order.assignedTables.map((table) => table.id));
    setPrimaryTableId(order.primaryTable?.id ?? "");
    setCash(0);
    setGcash(0);
    setGcashReference("");
    setView("orders");
  }

  async function refreshRestaurant() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["restaurant"] }),
      queryClient.invalidateQueries({ queryKey: ["pos-products"] }),
      queryClient.invalidateQueries({ queryKey: ["stock"] }),
      queryClient.invalidateQueries({ queryKey: ["reports"] })
    ]);
  }

  const openOrder = useMutation({
    mutationFn: (order: Pick<RestaurantOrder, "id" | "version">) => acquireRestaurantOrderLock(order.id, order.version),
    onSuccess: loadEditor
  });

  const newOrder = useMutation({
    mutationFn: (input: { orderType: RestaurantOrderType; customOrderType?: string | null; table?: RestaurantTable }) =>
      createRestaurantOrder({
        orderType: input.orderType,
        customOrderType: input.customOrderType,
        primaryTableId: input.table?.id,
        tableIds: input.table ? [input.table.id] : [],
        guestCount: input.table ? Math.min(2, input.table.capacity) : 1
      }),
    onSuccess: async (order) => {
      await refreshRestaurant();
      loadEditor(order);
    }
  });

  const saveOrder = useMutation({
    mutationFn: (status?: RestaurantOrderStatus) => {
      if (!editingOrder) throw new Error("Open an order first.");
      return updateRestaurantOrder({
        id: editingOrder.id,
        expectedVersion: editingOrder.version,
        status,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        queueNumber: queueNumber || null,
        guestCount,
        note: orderNote || null,
        items: editorItems.map(({ id: _id, name: _name, variant: _variant, inventoryUnit: _inventoryUnit, taxRate: _taxRate, ...item }) => item)
      });
    },
    onSuccess: async (order) => {
      await refreshRestaurant();
      loadEditor(order);
    }
  });

  const assignTables = useMutation({
    mutationFn: () => {
      if (!editingOrder || !primaryTableId) throw new Error("Choose a primary table.");
      return assignRestaurantOrderTables({ id: editingOrder.id, expectedVersion: editingOrder.version, tableIds: selectedTableIds, primaryTableId });
    },
    onSuccess: async (order) => {
      await refreshRestaurant();
      loadEditor(order);
    }
  });

  const cancelOrder = useMutation({
    mutationFn: () => {
      if (!editingOrder) throw new Error("Open an order first.");
      return cancelRestaurantOrder({ id: editingOrder.id, expectedVersion: editingOrder.version, reason: cancelReason });
    },
    onSuccess: async (order) => {
      await refreshRestaurant();
      loadEditor(order);
      setCancelOpen(false);
      setCancelReason("");
    }
  });

  const reopenOrder = useMutation({
    mutationFn: () => {
      if (!editingOrder) throw new Error("Open an order first.");
      return reopenRestaurantOrder({ id: editingOrder.id, expectedVersion: editingOrder.version });
    },
    onSuccess: async (order) => {
      await refreshRestaurant();
      loadEditor(order);
    }
  });

  const undoItemChange = useMutation({
    mutationFn: () => {
      if (!editingOrder) throw new Error("Open an order first.");
      return undoRestaurantOrderItemChange({ id: editingOrder.id, expectedVersion: editingOrder.version, reason: actionReason });
    },
    onSuccess: async (order) => { await refreshRestaurant(); loadEditor(order); setActionReason(""); }
  });

  const mergeOrders = useMutation({
    mutationFn: () => {
      if (!editingOrder) throw new Error("Open a target order first.");
      const source = orders.data?.items.find((order) => order.id === mergeSourceId);
      if (!source) throw new Error("Choose an active source order.");
      return mergeRestaurantOrders({ id: editingOrder.id, expectedVersion: editingOrder.version, sourceOrderId: source.id, sourceExpectedVersion: source.version, reason: actionReason });
    },
    onSuccess: async (order) => { await refreshRestaurant(); loadEditor(order); setMergeSourceId(""); setActionReason(""); }
  });

  const splitOrder = useMutation({
    mutationFn: () => {
      if (!editingOrder) throw new Error("Open an order first.");
      const items = Object.entries(splitQuantities).filter(([, quantity]) => quantity > 0).map(([itemId, quantity]) => ({ itemId, quantity }));
      return splitRestaurantOrder({ id: editingOrder.id, expectedVersion: editingOrder.version, items, reason: actionReason, customerName: customerName || null });
    },
    onSuccess: async (result) => { await refreshRestaurant(); loadEditor(result.source); setSplitOpen(false); setSplitQuantities({}); setActionReason(""); }
  });

  const reversePayment = useMutation({
    mutationFn: () => {
      if (!editingOrder?.completedSale || !reversalKind) throw new Error("Open a completed sale first.");
      const common = { saleId: editingOrder.completedSale.id, requestKey: crypto.randomUUID(), reason: reversalReason };
      if (reversalKind === "VOID") return voidSale(common);
      const items = Object.entries(refundQuantities).filter(([, quantity]) => quantity > 0).map(([saleItemId, quantity]) => ({ saleItemId, quantity }));
      return refundSale({ ...common, items });
    },
    onSuccess: async (refund) => { setCompletedReceipt(`${refund.receiptNumber} reversal`); setReversalKind(null); setReversalReason(""); setRefundQuantities({}); setEditingOrder(null); await refreshRestaurant(); }
  });

  const checkout = useMutation({
    mutationFn: async () => {
      if (!editingOrder) throw new Error("Open an order first.");
      const savedOrder = await updateRestaurantOrder({
        id: editingOrder.id,
        expectedVersion: editingOrder.version,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        queueNumber: queueNumber || null,
        guestCount,
        note: orderNote || null,
        items: editorItems.map(({ id: _id, name: _name, variant: _variant, inventoryUnit: _inventoryUnit, taxRate: _taxRate, ...item }) => item)
      });
      const payments = [
        ...(cash > 0 ? [{ method: "CASH" as const, amount: cash }] : []),
        ...(gcash > 0 ? [{ method: "GCASH" as const, amount: gcash, reference: gcashReference || null }] : [])
      ];
      return checkoutRestaurantOrder({ id: savedOrder.id, expectedVersion: savedOrder.version, payments });
    },
    onSuccess: async (sale) => {
      setCompletedReceipt(sale.receiptNumber);
      setEditingOrder(null);
      setEditorItems([]);
      await refreshRestaurant();
      setView("tables");
    }
  });

  async function holdOrder() {
    if (editingOrder) await releaseRestaurantOrderLock(editingOrder.id);
    setEditingOrder(null);
    setEditorItems([]);
    await refreshRestaurant();
  }

  function addProduct(product: Product) {
    if (!defaultWarehouseId) return;
    setEditorItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) return current.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      return [
        ...current,
        {
          productId: product.id,
          warehouseId: defaultWarehouseId,
          quantity: 1,
          soldUnit: product.sellingUnit,
          unitPrice: product.retailPrice / Math.max(product.packageSize, 0.001),
          discount: 0,
          note: null,
          name: product.name,
          variant: product.variant,
          inventoryUnit: product.inventoryUnit,
          taxRate: product.taxRate
        }
      ];
    });
  }

  const operationError = openOrder.error ?? newOrder.error ?? saveOrder.error ?? assignTables.error ?? cancelOrder.error ?? reopenOrder.error ?? undoItemChange.error ?? mergeOrders.error ?? splitOrder.error ?? reversePayment.error ?? checkout.error;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Restaurant</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Tables, open orders, and checkout in one workspace.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900" value={newOrderType === "OTHER" ? `OTHER:${newCustomOrderType}` : newOrderType} onChange={(event) => { const [type, custom = ""] = event.target.value.split(":", 2); setNewOrderType(type as RestaurantOrderType); setNewCustomOrderType(custom); }}>
            {Object.entries(orderTypeLabels).filter(([type]) => type !== "DINE_IN" && type !== "OTHER").map(([type, label]) => <option key={type} value={type}>{label}</option>)}
            {runtimeSettings.data?.restaurant.customOrderTypes.map((label) => <option key={label} value={`OTHER:${label}`}>{label}</option>)}
          </select>
          <button className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-ocean px-3 text-sm font-bold text-white" disabled={newOrderType === "OTHER" && !newCustomOrderType} onClick={() => newOrder.mutate({ orderType: newOrderType, customOrderType: newOrderType === "OTHER" ? newCustomOrderType : null })}>
            <Plus size={17} /> New order
          </button>
          {canManageTables ? (
            <button className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-900" onClick={() => setTableDialog("new")}>
              <Armchair size={17} /> Add table
            </button>
          ) : null}
          <button className="focus-ring grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" onClick={() => void refreshRestaurant()} aria-label="Refresh restaurant">
            <RefreshCw size={17} />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900" role="tablist">
          <button className={`focus-ring h-9 rounded px-4 text-sm font-bold ${view === "tables" ? "bg-ocean text-white" : "text-slate-600 dark:text-slate-300"}`} onClick={() => setView("tables")} role="tab" aria-selected={view === "tables"}>Tables</button>
          <button className={`focus-ring h-9 rounded px-4 text-sm font-bold ${view === "orders" ? "bg-ocean text-white" : "text-slate-600 dark:text-slate-300"}`} onClick={() => setView("orders")} role="tab" aria-selected={view === "orders"}>Active orders</button>
        </div>
        {view === "tables" && canManageTables ? <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={includeInactiveTables} onChange={(event) => setIncludeInactiveTables(event.target.checked)} /> Show inactive tables</label> : null}
      </div>

      {operationError ? <p className="rounded-md border border-rose/30 bg-rose/10 p-3 text-sm font-semibold text-rose">{operationError.message}</p> : null}
      {completedReceipt ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-mint/40 bg-mint/10 p-3 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          <span>Payment completed. Receipt {completedReceipt} is saved.</span>
          <button className="focus-ring grid h-8 w-8 place-items-center rounded-md" onClick={() => setCompletedReceipt("")} aria-label="Dismiss payment confirmation"><X size={16} /></button>
        </div>
      ) : null}

      {view === "tables" ? (
        <div className="space-y-5">
          {tables.isLoading ? <p className="text-sm font-semibold text-slate-500">Loading tables...</p> : null}
          {[...new Set(activeTables.map((table) => table.section))].map((section) => (
            <section key={section}>
              <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">{section}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {activeTables.filter((table) => table.section === section).map((table) => (
                  <article key={table.id} className={`min-h-40 rounded-md border p-4 ${tableTone[table.status]}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-bold">Table {table.number}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold uppercase"><Users size={13} /> {table.guestCount || 0}/{table.capacity} guests</p>
                      </div>
                      {canManageTables ? <button className="focus-ring grid h-8 w-8 place-items-center rounded-md" onClick={() => setTableDialog(table)} aria-label={`Edit table ${table.number}`}><Edit3 size={15} /></button> : null}
                    </div>
                    <p className="mt-4 text-sm font-bold">{statusLabel(table.status)}</p>
                    {table.activeOrder ? <p className="mt-1 text-sm">{table.activeOrder.orderNumber} · {statusLabel(table.activeOrder.status)}</p> : <p className="mt-1 text-sm">Ready for service</p>}
                    <div className="mt-4">
                      {table.activeOrder ? (
                        <button className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-white/80 px-3 text-sm font-bold text-ink dark:bg-slate-900 dark:text-white" onClick={() => {
                          if (!table.activeOrder) return;
                          openOrder.mutate({ id: table.activeOrder.id, version: table.activeOrder.version });
                        }}><HandPlatter size={16} /> Resume order</button>
                      ) : table.status === "CLEANING" ? (
                        <button className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-white/80 px-3 text-sm font-bold text-ink dark:bg-slate-900 dark:text-white" onClick={() => updateRestaurantTable({ id: table.id, status: "AVAILABLE" }).then(refreshRestaurant)}><Check size={16} /> Mark ready</button>
                      ) : table.status === "AVAILABLE" ? (
                        <button className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-white/80 px-3 text-sm font-bold text-ink dark:bg-slate-900 dark:text-white" onClick={() => newOrder.mutate({ orderType: "DINE_IN", table })}><Plus size={16} /> Open table</button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {!tables.isLoading && !activeTables.length ? <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No active tables yet. Add or restore a table to begin dine-in service.</div> : null}
          {includeInactiveTables && inactiveTables.length ? <section><h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Inactive tables</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{inactiveTables.map((table) => <article key={table.id} className="min-h-32 rounded-md border border-slate-300 bg-slate-100 p-4 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-bold">Table {table.number}</p><p className="mt-1 text-xs font-semibold uppercase">{table.section} · {table.capacity} seats</p></div><button className="focus-ring grid h-8 w-8 place-items-center rounded-md" onClick={() => setTableDialog(table)} aria-label={`Restore table ${table.number}`}><Edit3 size={15} /></button></div><p className="mt-4 text-sm font-semibold">Inactive</p></article>)}</div></section> : null}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input className="focus-ring h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800" placeholder="Search orders" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={includeClosed} onChange={(event) => setIncludeClosed(event.target.checked)} /> Show closed orders</label>
            <div className="mt-4 max-h-[65vh] space-y-2 overflow-auto">
              {orders.data?.items.map((order) => (
                <button key={order.id} className={`focus-ring w-full rounded-md border p-3 text-left ${editingOrder?.id === order.id ? "border-ocean bg-ocean/5" : "border-slate-200 dark:border-slate-700"}`} onClick={() => closedOrderStatuses.includes(order.status) ? loadEditor(order) : openOrder.mutate(order)}>
                  <div className="flex items-center justify-between gap-2"><span className="font-bold">{order.orderNumber}</span><span className="text-xs font-semibold">{statusLabel(order.status)}</span></div>
                  <p className="mt-1 text-xs text-slate-500">{orderTypeLabel(order)}{order.primaryTable ? ` · Table ${order.primaryTable.number}` : ""}</p>
                  <div className="mt-2 flex items-center justify-between text-sm"><span>{order.customerName || "Guest"}</span><strong>{formatCurrency(order.grandTotal)}</strong></div>
                  {order.lockedBy ? <p className="mt-2 flex items-center gap-1 text-xs text-amber"><LockKeyhole size={12} /> {order.lockedBy.name}</p> : null}
                </button>
              ))}
              {!orders.isLoading && !orders.data?.items.length ? <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-800">No matching orders.</p> : null}
            </div>
          </aside>

          {editingOrder ? (
            <div className="space-y-4">
              <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase text-ocean">{orderTypeLabel(editingOrder)}</p><h3 className="mt-1 text-xl font-bold">{editingOrder.orderNumber}</h3><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 size={13} /> Updated {new Date(editingOrder.updatedAt).toLocaleTimeString()}</p></div>
                  {!closedOrderStatuses.includes(editingOrder.status) ? (
                    <div className="flex flex-wrap gap-2">
                      <button className="focus-ring h-9 rounded-md border border-slate-200 px-3 text-sm font-bold dark:border-slate-700" onClick={() => void holdOrder()}>Hold</button>
                      {nextOrderStatus[editingOrder.status] ? <button className="focus-ring h-9 rounded-md bg-amber px-3 text-sm font-bold text-white" onClick={() => saveOrder.mutate(nextOrderStatus[editingOrder.status])}>{statusLabel(nextOrderStatus[editingOrder.status] as string)}</button> : null}
                      <button className="focus-ring h-9 rounded-md bg-ocean px-3 text-sm font-bold text-white" onClick={() => saveOrder.mutate(undefined)} disabled={saveOrder.isPending}>Save order</button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-sm font-semibold">Customer name<input className="focus-ring mt-2 h-10 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
                  <label className="text-sm font-semibold">Phone<input className="focus-ring mt-2 h-10 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></label>
                  <label className="text-sm font-semibold">Guests<input className="focus-ring mt-2 h-10 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" type="number" min="1" value={guestCount} onChange={(event) => setGuestCount(Number(event.target.value))} /></label>
                  <label className="text-sm font-semibold">Queue number<input className="focus-ring mt-2 h-10 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={queueNumber} onChange={(event) => setQueueNumber(event.target.value)} /></label>
                </div>
                <label className="mt-3 block text-sm font-semibold">Order notes<input className="focus-ring mt-2 h-10 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={orderNote} onChange={(event) => setOrderNote(event.target.value)} /></label>
              </section>

              <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h4 className="font-bold">Order items</h4>
                  <div className="mt-4 space-y-3">
                    {editorItems.map((item) => (
                      <div key={item.productId} className="grid gap-3 border-b border-slate-100 pb-3 dark:border-slate-800 sm:grid-cols-[1fr_150px_44px]">
                        <div><p className="font-semibold">{item.name}{item.variant ? ` · ${item.variant}` : ""}</p><input className="focus-ring mt-2 h-9 w-full rounded-md border border-slate-200 px-2 text-xs dark:border-slate-700 dark:bg-slate-800" placeholder="Item note" value={item.note ?? ""} onChange={(event) => setEditorItems((current) => current.map((entry) => entry.productId === item.productId ? { ...entry, note: event.target.value || null } : entry))} /></div>
                        <div className="flex items-center gap-2"><button className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-slate-200 dark:border-slate-700" onClick={() => setEditorItems((current) => current.map((entry) => entry.productId === item.productId ? { ...entry, quantity: Math.max(0.001, entry.quantity - 1) } : entry))}><Minus size={15} /></button><input className="focus-ring h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-center dark:border-slate-700 dark:bg-slate-800" type="number" min="0.001" step="any" value={item.quantity} onChange={(event) => setEditorItems((current) => current.map((entry) => entry.productId === item.productId ? { ...entry, quantity: Number(event.target.value) } : entry))} /><button className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-slate-200 dark:border-slate-700" onClick={() => setEditorItems((current) => current.map((entry) => entry.productId === item.productId ? { ...entry, quantity: entry.quantity + 1 } : entry))}><Plus size={15} /></button></div>
                        <button className="focus-ring grid h-9 w-9 place-items-center rounded-md text-rose" onClick={() => window.confirm(`Remove ${item.name} from this order? Stock is not deducted until payment.`) && setEditorItems((current) => current.filter((entry) => entry.productId !== item.productId))} aria-label={`Remove ${item.name}`}><Trash2 size={17} /></button>
                      </div>
                    ))}
                    {!editorItems.length ? <p className="rounded-md bg-slate-100 p-4 text-sm text-slate-500 dark:bg-slate-800">No items yet.</p> : null}
                  </div>
                </div>
                <aside className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input className="focus-ring h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800" placeholder="Find menu item" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} /></div>
                  <div className="mt-3 max-h-80 space-y-2 overflow-auto">{restaurantProducts.map((product) => { const available = availableByProductId.get(product.id) ?? productStock(product); return <button key={product.id} className="focus-ring w-full rounded-md border border-slate-200 p-3 text-left dark:border-slate-700" onClick={() => addProduct(product)} disabled={available <= 0}><div className="flex justify-between gap-2"><span className="font-semibold">{product.name}</span><span className="text-sm">{formatCurrency(product.retailPrice)}</span></div><p className="mt-1 text-xs text-slate-500">{available.toLocaleString()} {product.inventoryUnit.toLowerCase()} available</p></button>; })}</div>
                </aside>
              </section>

              <section className="grid gap-4 2xl:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h4 className="font-bold">Tables</h4>
                  <div className="mt-3 grid grid-cols-2 gap-2">{activeTables.map((table) => {
                    const selectable = !table.activeOrder || table.activeOrder.id === editingOrder.id;
                    return <label key={table.id} className={`flex items-center gap-2 rounded-md border p-2 text-sm ${selectable ? "border-slate-200 dark:border-slate-700" : "cursor-not-allowed opacity-40"}`}><input type="checkbox" disabled={!selectable} checked={selectedTableIds.includes(table.id)} onChange={(event) => { setSelectedTableIds((current) => event.target.checked ? [...new Set([...current, table.id])] : current.filter((id) => id !== table.id)); if (event.target.checked && !primaryTableId) setPrimaryTableId(table.id); }} /><input type="radio" name="primary-table" disabled={!selectable || !selectedTableIds.includes(table.id)} checked={primaryTableId === table.id} onChange={() => setPrimaryTableId(table.id)} /> Table {table.number}</label>;
                  })}</div>
                  <button className="focus-ring mt-4 h-9 rounded-md border border-ocean px-3 text-sm font-bold text-ocean" onClick={() => window.confirm(`Transfer this order to ${selectedTableIds.length} selected table${selectedTableIds.length === 1 ? "" : "s"}?`) && assignTables.mutate()} disabled={!primaryTableId || !selectedTableIds.length}>Move / join tables</button>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between"><h4 className="font-bold">Payment</h4><strong className="text-xl">{formatCurrency(editorTotal)}</strong></div>
                  <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Cash<input className="focus-ring mt-2 h-10 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" type="number" min="0" step="0.01" value={cash} onChange={(event) => setCash(Number(event.target.value))} /></label><label className="text-sm font-semibold">GCash<input className="focus-ring mt-2 h-10 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" type="number" min="0" step="0.01" value={gcash} onChange={(event) => setGcash(Number(event.target.value))} /></label></div>
                  {gcash > 0 ? <label className="mt-3 block text-sm font-semibold">GCash reference<input className="focus-ring mt-2 h-10 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" value={gcashReference} onChange={(event) => setGcashReference(event.target.value)} /></label> : null}
                  {!closedOrderStatuses.includes(editingOrder.status) ? <button className="focus-ring mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-mint px-4 text-sm font-bold text-white disabled:opacity-50" onClick={() => checkout.mutate()} disabled={!editorItems.length || cash + gcash < editorTotal}><CreditCard size={17} /> Complete payment</button> : null}
                  <div className="mt-3 flex gap-2">{canCancel && editingOrder.status !== "CANCELLED" && editingOrder.status !== "COMPLETED" ? <button className="focus-ring h-9 rounded-md px-3 text-sm font-bold text-rose" onClick={() => setCancelOpen(true)}>Cancel order</button> : null}{canReopen && editingOrder.status === "CANCELLED" ? <button className="focus-ring h-9 rounded-md px-3 text-sm font-bold text-ocean" onClick={() => reopenOrder.mutate()}>Reopen order</button> : null}</div>
                </div>
              </section>

              {!closedOrderStatuses.includes(editingOrder.status) ? <section className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold">Order recovery</h4><p className="mt-1 text-sm text-slate-500">{editingOrder.reservations.length ? `${editingOrder.reservations.reduce((sum, reservation) => sum + reservation.quantity, 0).toLocaleString()} base units reserved for this confirmed order.` : "This order has not deducted stock. Confirming it reserves available quantities."}</p></div><span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold dark:bg-slate-800">Version {editingOrder.version}</span></div>
                <input className="focus-ring mt-4 h-10 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800" placeholder="Reason for undo, merge, or split" value={actionReason} onChange={(event) => setActionReason(event.target.value)} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="focus-ring h-9 rounded-md border border-slate-200 px-3 text-sm font-bold dark:border-slate-700" disabled={actionReason.trim().length < 3 || undoItemChange.isPending} onClick={() => window.confirm("Restore the items from the most recent saved item change?") && undoItemChange.mutate()}>Undo last item change</button>
                  {canSplit ? <button className="focus-ring h-9 rounded-md border border-slate-200 px-3 text-sm font-bold dark:border-slate-700" onClick={() => setSplitOpen((current) => !current)}>Split bill</button> : null}
                </div>
                {canSplit ? <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]"><select className="focus-ring h-10 min-w-0 rounded-md border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={mergeSourceId} onChange={(event) => setMergeSourceId(event.target.value)}><option value="">Select order to merge into this order</option>{orders.data?.items.filter((order) => order.id !== editingOrder.id && !closedOrderStatuses.includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.customerName || orderTypeLabel(order)}</option>)}</select><button className="focus-ring h-10 rounded-md border border-ocean px-3 text-sm font-bold text-ocean" disabled={!mergeSourceId || actionReason.trim().length < 3} onClick={() => window.confirm("Merge the selected order into this order? Its tables and reservations will move here.") && mergeOrders.mutate()}>Merge orders</button></div> : null}
                {splitOpen ? <div className="mt-4 rounded-md border border-slate-200 p-4 dark:border-slate-700"><h5 className="text-sm font-bold">Quantities for new split order</h5><div className="mt-3 space-y-2">{editingOrder.items.map((item) => <label key={item.id} className="grid grid-cols-[1fr_120px] items-center gap-3 text-sm"><span>{item.product.name} <span className="text-slate-500">of {item.quantity}</span></span><input className="focus-ring h-9 rounded-md border border-slate-200 px-2 dark:border-slate-700 dark:bg-slate-800" type="number" min="0" max={item.quantity} step="any" value={splitQuantities[item.id] ?? 0} onChange={(event) => setSplitQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))} /></label>)}</div><div className="mt-3 flex gap-2"><button className="focus-ring h-9 rounded-md bg-ocean px-3 text-sm font-bold text-white" disabled={actionReason.trim().length < 3 || !Object.values(splitQuantities).some((quantity) => quantity > 0)} onClick={() => window.confirm("Create a separate unpaid order with these quantities? Reservations will be recalculated safely.") && splitOrder.mutate()}>Create split order</button><button className="focus-ring h-9 rounded-md px-3 text-sm font-bold" onClick={() => { setSplitOpen(false); setSplitQuantities({}); }}>Cancel</button></div></div> : null}
              </section> : null}

              {editingOrder.status === "COMPLETED" && editingOrder.completedSale && (canRefund || canVoid) ? <section className="rounded-md border border-rose/30 bg-rose/5 p-5"><h4 className="font-bold">Completed sale reversal</h4><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Receipt {editingOrder.completedSale.receiptNumber}. Reversals restore stock through permanent return movements.</p><div className="mt-3 flex gap-2">{canRefund ? <button className="focus-ring h-9 rounded-md border border-rose/40 px-3 text-sm font-bold text-rose" onClick={() => setReversalKind("REFUND")}>Refund selected items</button> : null}{canVoid ? <button className="focus-ring h-9 rounded-md bg-rose px-3 text-sm font-bold text-white" onClick={() => setReversalKind("VOID")}>Void full sale</button> : null}</div>
                {reversalKind ? <div className="mt-4 rounded-md border border-rose/30 bg-white p-4 dark:bg-slate-900"><h5 className="font-bold">{reversalKind === "VOID" ? "Void this completed sale and restore all remaining inventory?" : "Refund selected quantities and restore their inventory?"}</h5>{reversalKind === "REFUND" ? <div className="mt-3 space-y-2">{editingOrder.completedSale.items.map((item) => <label key={item.id} className="grid grid-cols-[1fr_120px] items-center gap-3 text-sm"><span>{editingOrder.items.find((orderItem) => orderItem.productId === item.productId)?.product.name ?? item.productId} <span className="text-slate-500">of {item.soldQuantity} {item.soldUnit.toLowerCase()}</span></span><input className="focus-ring h-9 rounded-md border border-slate-200 px-2 dark:border-slate-700 dark:bg-slate-800" type="number" min="0" max={item.soldQuantity} step="any" value={refundQuantities[item.id] ?? 0} onChange={(event) => setRefundQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))} /></label>)}</div> : null}<input className="focus-ring mt-3 h-10 w-full rounded-md border border-rose/30 px-3 dark:bg-slate-800" placeholder="Required reversal reason" value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} /><div className="mt-3 flex gap-2"><button className="focus-ring h-9 rounded-md bg-rose px-3 text-sm font-bold text-white" disabled={reversalReason.trim().length < 3 || (reversalKind === "REFUND" && !Object.values(refundQuantities).some((quantity) => quantity > 0))} onClick={() => window.confirm(reversalKind === "VOID" ? "Void this sale, record the payment reversal, and restore inventory?" : "Create this refund and restore the selected inventory?") && reversePayment.mutate()}>Confirm {reversalKind.toLowerCase()}</button><button className="focus-ring h-9 rounded-md px-3 text-sm font-bold" onClick={() => { setReversalKind(null); setReversalReason(""); setRefundQuantities({}); }}>Keep sale</button></div></div> : null}
              </section> : null}

              {cancelOpen ? <section className="rounded-md border border-rose/30 bg-rose/10 p-4"><h4 className="font-bold text-rose">Cancel this order?</h4><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">The order remains in history and can be reopened by an authorized user.</p><input className="focus-ring mt-3 h-10 w-full rounded-md border border-rose/30 bg-white px-3 dark:bg-slate-900" placeholder="Cancellation reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /><div className="mt-3 flex gap-2"><button className="focus-ring h-9 rounded-md bg-rose px-3 text-sm font-bold text-white" disabled={cancelReason.trim().length < 3} onClick={() => cancelOrder.mutate()}>Confirm cancellation</button><button className="focus-ring h-9 rounded-md px-3 text-sm font-bold" onClick={() => setCancelOpen(false)}>Keep order</button></div></section> : null}
            </div>
          ) : (
            <div className="grid min-h-96 place-items-center rounded-md border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><div><HandPlatter className="mx-auto text-slate-400" size={36} /><p className="mt-3 font-bold">Select an order to resume it</p><p className="mt-1 text-sm text-slate-500">Open orders remain saved until payment or cancellation.</p></div></div>
          )}
        </div>
      )}

      {tableDialog ? <TableDialog table={tableDialog === "new" ? null : tableDialog} onClose={() => setTableDialog(null)} onSaved={async () => { setTableDialog(null); await refreshRestaurant(); }} /> : null}
    </section>
  );
}
