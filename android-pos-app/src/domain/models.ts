export const QUANTITY_SCALE = 1_000_000;

export const inventoryUnits = ["PIECE", "KILOGRAM", "GRAM", "LITER", "MILLILITER", "METER", "CENTIMETER", "YARD", "FOOT", "CASE", "PACK"] as const;
export type UnitCode = (typeof inventoryUnits)[number];

export type ProductRecord = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  inventoryUnit: UnitCode;
  sellingUnit: UnitCode;
  unitRatioMicro: number;
  packageSizeMicro: number;
  costPriceCents: number;
  retailPriceCents: number;
  wholesalePriceCents: number;
  wholesaleThresholdMicro: number;
  taxBasisPoints: number;
  minimumStockMicro: number;
  status: "ACTIVE" | "INACTIVE";
  stockMicro: number;
  reservedMicro: number;
  availableMicro: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = Omit<ProductRecord, "id" | "categoryName" | "stockMicro" | "reservedMicro" | "availableMicro" | "createdAt" | "updatedAt"> & {
  id?: string;
};

export type CartLine = {
  productId: string;
  name: string;
  soldQuantityMicro: number;
  soldUnit: UnitCode;
  baseQuantityMicro: number;
  unitPriceCents: number;
  discountCents: number;
  taxBasisPoints: number;
};

export type PaymentInput = {
  method: "CASH" | "GCASH" | "CARD" | "OTHER";
  amountCents: number;
  reference?: string | null;
};

export type SaleCommand = {
  requestKey: string;
  orderId?: string | null;
  orderType: OrderType | "RETAIL";
  customOrderType?: string | null;
  cashierId: string;
  lines: CartLine[];
  payments: PaymentInput[];
  serviceChargeCents?: number;
  tipCents?: number;
};

export type SaleSummary = {
  id: string;
  receiptNumber: string;
  orderNumber: string | null;
  orderType: string;
  status: string;
  grandTotalCents: number;
  paidTotalCents: number;
  changeTotalCents: number;
  createdAt: string;
};

export const orderTypes = ["DINE_IN", "WALK_IN", "COUNTER", "TAKEOUT", "PICKUP", "DELIVERY", "OTHER"] as const;
export type OrderType = (typeof orderTypes)[number];
export type OrderStatus = "OPEN" | "CONFIRMED" | "PREPARING" | "READY" | "SERVED" | "COMPLETED" | "CANCELLED";

export type RestaurantTableRecord = {
  id: string;
  number: string;
  section: string;
  capacity: number;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "UNAVAILABLE";
  guestCount: number;
  activeOrderId: string | null;
  activeOrderNumber: string | null;
  isActive: boolean;
  version: number;
};

export type OrderLine = CartLine & {
  id?: string;
  note?: string | null;
};

export type OrderRecord = {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  customOrderType: string | null;
  status: OrderStatus;
  customerName: string | null;
  guestCount: number;
  notes: string | null;
  tableIds: string[];
  primaryTableId: string | null;
  lines: OrderLine[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalUser = {
  id: string;
  name: string;
  login: string;
  role: "OWNER" | "MANAGER" | "CASHIER";
  permissions: string[];
};

export type DashboardSnapshot = {
  todaySalesCents: number;
  todaySalesCount: number;
  availableStockMicro: number;
  lowStockCount: number;
  openOrderCount: number;
  occupiedTableCount: number;
};

export type AppSettings = {
  businessName: string;
  businessMode: "RETAIL" | "RESTAURANT" | "HYBRID";
  currency: "PHP";
  paperWidth: "58mm" | "80mm";
  receiptFooter: string;
  serviceChargeBasisPoints: number;
  customOrderTypes: string[];
  darkMode: boolean;
};

export function createUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function createId(prefix: string) {
  return `${prefix}_${createUuid()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function toMicro(value: number) {
  return Math.round(value * QUANTITY_SCALE);
}

export function fromMicro(value: number) {
  return value / QUANTITY_SCALE;
}

export function formatQuantity(value: number) {
  return fromMicro(value).toLocaleString("en-PH", { maximumFractionDigits: 3 });
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(cents / 100);
}
