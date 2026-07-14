import { z } from "zod";

const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string()
});

export type ApiHealth = z.infer<typeof healthSchema>;

const apiUrl = import.meta.env.VITE_API_URL ?? "";
const sessionKey = "wholesalepos.session";

export function getApiBaseUrl() {
  return apiUrl || window.location.origin;
}

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  storeId: z.string().nullable()
});

const currentUserSchema = userSchema.extend({
  permissions: z.array(z.string())
});

const managedUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
  isActive: z.boolean(),
  createdAt: z.string()
});

const authSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSchema
});

const setupStatusSchema = z.object({
  requiresSetup: z.boolean()
});

const passwordVerificationSchema = z.object({
  verified: z.boolean()
});

const productSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  variant: z.string().nullable(),
  salesChannel: z.enum(["RETAIL", "RESTAURANT", "BOTH"]),
  brand: z.string().nullable(),
  inventoryUnit: z.string(),
  sellingUnit: z.string(),
  packageSize: z.coerce.number(),
  retailPrice: z.coerce.number(),
  wholesalePrice: z.coerce.number(),
  costPrice: z.coerce.number(),
  wholesaleThreshold: z.coerce.number(),
  minimumStock: z.coerce.number(),
  taxRate: z.coerce.number(),
  status: z.string(),
  barcodes: z.array(z.object({ id: z.string(), value: z.string(), isPrimary: z.boolean() })).default([]),
  stocks: z
    .array(
      z.object({
        id: z.string(),
        productId: z.string(),
        warehouseId: z.string(),
        quantity: z.coerce.number(),
        warehouse: z.object({ id: z.string(), name: z.string(), code: z.string(), storeId: z.string() }).optional()
      })
    )
    .default([])
});

const productListSchema = z.object({
  items: z.array(productSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number()
  })
});

const warehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  storeId: z.string()
});

const inventoryStockSchema = z.object({
  id: z.string(),
  productId: z.string(),
  warehouseId: z.string(),
  quantity: z.coerce.number(),
  product: z.object({
    id: z.string(),
    sku: z.string(),
    name: z.string(),
    minimumStock: z.coerce.number(),
    inventoryUnit: z.string()
  }),
  warehouse: warehouseSchema
});

const inventoryMovementSchema = z.object({
  id: z.string(),
  productId: z.string(),
  warehouseId: z.string(),
  type: z.string(),
  quantity: z.coerce.number(),
  unitCost: z.coerce.number().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  product: z.object({ id: z.string(), sku: z.string(), name: z.string() }),
  warehouse: z.object({ id: z.string(), code: z.string(), name: z.string() }),
  createdBy: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable()
});

const saleSummarySchema = z.object({
  id: z.string(),
  receiptNumber: z.string(),
  orderNumber: z.string().nullable().optional(),
  orderType: z.enum(["RETAIL", "DINE_IN", "TAKEOUT", "DELIVERY", "WALK_IN", "COUNTER", "PICKUP"]).optional(),
  grandTotal: z.coerce.number(),
  paidTotal: z.coerce.number(),
  changeTotal: z.coerce.number()
});

const receiptSchema = z.object({
  saleId: z.string(),
  receiptNumber: z.string(),
  paperWidth: z.enum(["58mm", "80mm"]),
  barcodeData: z.string(),
  barcodeSvg: z.string(),
  text: z.string(),
  html: z.string(),
  escPosBase64: z.string(),
  printLogId: z.string().optional()
});

const reportOverviewSchema = z.object({
  period: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  summary: z.object({
    salesCount: z.number(),
    revenue: z.number(),
    grossProfit: z.number(),
    averageSale: z.number(),
    inventoryValue: z.number(),
    lowStockCount: z.number()
  }),
  bestSellers: z.array(z.object({ id: z.string(), sku: z.string(), name: z.string(), quantity: z.number(), revenue: z.number(), profit: z.number() })),
  cashierSales: z.array(z.object({ id: z.string(), name: z.string(), saleCount: z.number(), revenue: z.number() })),
  paymentSummary: z.array(z.object({ id: z.string(), method: z.string(), count: z.number(), amount: z.number() })),
  inventoryReport: z.array(
    z.object({
      productId: z.string(),
      sku: z.string(),
      name: z.string(),
      warehouse: z.string(),
      quantity: z.number(),
      unit: z.string(),
      value: z.number(),
      alert: z.string()
    })
  )
});

const reportExportSchema = z.object({
  format: z.enum(["pdf", "excel"]),
  mimeType: z.string(),
  fileName: z.string(),
  content: z.string()
});

const appSettingsSchema = z.object({
  businessMode: z.object({ mode: z.enum(["RETAIL", "RESTAURANT", "HYBRID"]) }),
  business: z.object({ name: z.string(), phone: z.string(), email: z.string(), address: z.string() }),
  tax: z.object({ vatRate: z.number(), pricesIncludeVat: z.boolean() }),
  receipt: z.object({ footer: z.string(), paperWidth: z.enum(["58mm", "80mm"]) }),
  printer: z.object({ printerName: z.string(), printerType: z.enum(["WINDOWS", "ESC_POS"]) }),
  theme: z.object({ mode: z.enum(["light", "dark", "system"]) }),
  backup: z.object({ automaticBackupsEnabled: z.boolean(), retentionDays: z.number() }),
  inventoryImport: z.object({
    batchSize: z.number(),
    preventDuplicateFiles: z.boolean(),
    defaultMode: z.enum(["ADD_NEW", "UPDATE_EXISTING", "ADD_AND_UPDATE", "ADD_STOCK", "REPLACE_STOCK", "ADJUST_STOCK", "INITIAL_INVENTORY"])
  }),
  restaurant: z.object({
    enableTables: z.boolean(),
    allowWalkInOrders: z.boolean(),
    enableDelivery: z.boolean(),
    enableTakeout: z.boolean(),
    enableKitchenTickets: z.boolean(),
    serviceChargeRate: z.number(),
    splitBilling: z.boolean(),
    partialPayments: z.boolean(),
    orderNumberFormat: z.string()
  })
});

const backupRunSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  filePath: z.string().nullable(),
  fileSizeBytes: z.coerce.number().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable()
});

const paginatedStockSchema = z.object({
  items: z.array(inventoryStockSchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() })
});

const paginatedMovementsSchema = z.object({
  items: z.array(inventoryMovementSchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() })
});

const productImportResultSchema = z.object({
  createdCount: z.number(),
  failedCount: z.number(),
  created: z.array(z.object({ rowNumber: z.number(), id: z.string(), name: z.string(), sku: z.string() })),
  errors: z.array(z.object({ rowNumber: z.number(), name: z.string(), message: z.string() }))
});

const inventoryImportModeSchema = z.enum(["ADD_NEW", "UPDATE_EXISTING", "ADD_AND_UPDATE", "ADD_STOCK", "REPLACE_STOCK", "ADJUST_STOCK", "INITIAL_INVENTORY"]);

const inventoryImportNormalizedRowSchema = z
  .object({
    rowNumber: z.number(),
    productId: z.string().optional(),
    sku: z.string().optional(),
    barcode: z.string().optional(),
    name: z.string().optional(),
    variant: z.string().optional(),
    salesChannel: z.enum(["RETAIL", "RESTAURANT", "BOTH"]).optional(),
    stock: z.number().optional()
  })
  .passthrough();

const inventoryImportPreviewRowSchema = z.object({
  rowNumber: z.number(),
  status: z.enum(["VALID", "WARNING", "INVALID"]),
  action: z.enum(["CREATE", "UPDATE", "STOCK", "SKIP", "REVIEW", "INVALID"]),
  matchMethod: z.enum(["PRODUCT_ID", "SKU", "BARCODE", "NAME_VARIANT", "NAME"]).optional(),
  matchedProduct: z
    .object({ id: z.string(), sku: z.string(), name: z.string(), variant: z.string().nullable(), updatedAt: z.string() })
    .optional(),
  normalized: inventoryImportNormalizedRowSchema,
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  previousStock: z.coerce.number().optional(),
  stockDelta: z.coerce.number()
});

const inventoryImportPreviewSchema = z.object({
  fingerprint: z.string(),
  duplicateBatch: z.object({ id: z.string(), sourceName: z.string(), createdAt: z.string(), status: z.string() }).nullable(),
  mode: inventoryImportModeSchema,
  warehouse: z.object({ id: z.string(), code: z.string(), name: z.string() }),
  rows: z.array(inventoryImportPreviewRowSchema),
  summary: z.object({
    rowCount: z.number(),
    validCount: z.number(),
    warningCount: z.number(),
    invalidCount: z.number(),
    createCount: z.number(),
    updateCount: z.number(),
    stockCount: z.number(),
    skippedCount: z.number(),
    reviewCount: z.number(),
    stockDelta: z.coerce.number()
  })
});

const inventoryImportRowResultSchema = z.object({
  id: z.string(),
  rowNumber: z.number(),
  action: z.string(),
  status: z.string(),
  matchMethod: z.string().nullable(),
  previousStock: z.coerce.number().nullable(),
  newStock: z.coerce.number().nullable(),
  quantityChanged: z.coerce.number().nullable(),
  warnings: z.array(z.string()).nullable(),
  errors: z.array(z.string()).nullable(),
  product: z.object({ id: z.string(), sku: z.string(), name: z.string(), variant: z.string().nullable() }).nullable()
});

const inventoryImportBatchSchema = z.object({
  id: z.string(),
  mode: inventoryImportModeSchema,
  status: z.string(),
  sourceName: z.string(),
  rowCount: z.number(),
  validCount: z.number(),
  warningCount: z.number(),
  invalidCount: z.number(),
  createdCount: z.number(),
  updatedCount: z.number(),
  skippedCount: z.number(),
  failedCount: z.number(),
  stockDelta: z.coerce.number(),
  durationMs: z.number().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  rolledBackAt: z.string().nullable(),
  warehouse: z.object({ id: z.string(), code: z.string(), name: z.string() }),
  createdBy: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  rolledBackBy: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  rows: z.array(inventoryImportRowResultSchema).optional()
});

const inventoryImportListSchema = z.object({
  items: z.array(inventoryImportBatchSchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() })
});

const inventoryImportPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  mapping: z.record(z.string()),
  createdAt: z.string()
});

const runtimeSettingsSchema = appSettingsSchema.pick({ businessMode: true, restaurant: true });

const restaurantTableSchema = z.object({
  id: z.string(),
  number: z.string(),
  section: z.string(),
  capacity: z.number(),
  status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "AWAITING_ORDER", "PREPARING", "SERVED", "AWAITING_PAYMENT", "CLEANING"]),
  guestCount: z.number(),
  occupiedAt: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  assignedStaff: z.object({ id: z.string(), name: z.string() }).nullable(),
  activeOrder: z
    .object({ id: z.string(), orderNumber: z.string().nullable(), orderType: z.string(), status: z.string(), guestCount: z.number(), version: z.number(), updatedAt: z.string() })
    .nullable()
});

const restaurantOrderItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  warehouseId: z.string().nullable(),
  quantity: z.coerce.number(),
  soldUnit: z.string(),
  baseQuantity: z.coerce.number(),
  unitPrice: z.coerce.number(),
  discount: z.coerce.number(),
  taxAmount: z.coerce.number(),
  lineTotal: z.coerce.number(),
  note: z.string().nullable(),
  product: z.object({ id: z.string(), sku: z.string(), name: z.string(), variant: z.string().nullable(), inventoryUnit: z.string(), sellingUnit: z.string(), taxRate: z.coerce.number() })
});

const restaurantOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.string().nullable(),
  orderType: z.enum(["DINE_IN", "WALK_IN", "COUNTER", "TAKEOUT", "PICKUP", "DELIVERY"]),
  status: z.enum(["DRAFT", "OPEN", "PREPARING", "READY", "SERVED", "PAID", "COMPLETED", "CANCELLED"]),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  queueNumber: z.string().nullable(),
  guestCount: z.number(),
  note: z.string().nullable(),
  subtotal: z.coerce.number(),
  discountTotal: z.coerce.number(),
  taxTotal: z.coerce.number(),
  grandTotal: z.coerce.number(),
  serviceCharge: z.coerce.number(),
  tip: z.coerce.number(),
  version: z.number(),
  lockExpiresAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  updatedAt: z.string(),
  cashier: z.object({ id: z.string(), name: z.string() }),
  primaryTable: z.object({ id: z.string(), number: z.string(), section: z.string() }).nullable(),
  assignedTables: z.array(z.object({ id: z.string(), number: z.string(), section: z.string(), status: z.string() })),
  lockedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  completedSale: z.object({ id: z.string(), receiptNumber: z.string() }).nullable(),
  items: z.array(restaurantOrderItemSchema)
});

const restaurantOrderListSchema = z.object({
  items: z.array(restaurantOrderSchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() })
});

export type AuthSession = z.infer<typeof authSessionSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type ManagedUser = z.infer<typeof managedUserSchema>;
export type Product = z.infer<typeof productSchema>;
export type Warehouse = z.infer<typeof warehouseSchema>;
export type InventoryStock = z.infer<typeof inventoryStockSchema>;
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;
export type SaleSummary = z.infer<typeof saleSummarySchema>;
export type ReceiptPreview = z.infer<typeof receiptSchema>;
export type ReportOverview = z.infer<typeof reportOverviewSchema>;
export type ReportPeriod = "daily" | "weekly" | "monthly" | "custom";
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type BackupRun = z.infer<typeof backupRunSchema>;
export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;
export type RestaurantTable = z.infer<typeof restaurantTableSchema>;
export type RestaurantOrder = z.infer<typeof restaurantOrderSchema>;
export type RestaurantOrderType = RestaurantOrder["orderType"];
export type RestaurantOrderStatus = RestaurantOrder["status"];
export type RestaurantOrderItemInput = {
  productId: string;
  warehouseId: string;
  quantity: number;
  soldUnit?: string;
  unitPrice?: number;
  discount: number;
  note?: string | null;
};

export type ProductCreatePayload = {
  sku?: string | null;
  name: string;
  variant?: string | null;
  salesChannel: "RETAIL" | "RESTAURANT" | "BOTH";
  brand?: string | null;
  barcode?: string | null;
  inventoryUnit: string;
  sellingUnit: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  packageSize: number;
  wholesaleThreshold: number;
  minimumStock: number;
};

export type ProductImportPayload = ProductCreatePayload & {
  initialStock: number;
  unitCost?: number | null;
};

export type ProductImportResult = z.infer<typeof productImportResultSchema>;
export type InventoryImportMode = z.infer<typeof inventoryImportModeSchema>;
export type InventoryImportDuplicateAction = "SKIP" | "UPDATE" | "MERGE" | "MANUAL_REVIEW";
export type InventoryImportPreview = z.infer<typeof inventoryImportPreviewSchema>;
export type InventoryImportBatch = z.infer<typeof inventoryImportBatchSchema>;
export type InventoryImportPreset = z.infer<typeof inventoryImportPresetSchema>;
export type InventoryImportRowInput = {
  rowNumber: number;
  productId?: unknown;
  sku?: unknown;
  barcode?: unknown;
  name?: unknown;
  variant?: unknown;
  salesChannel?: unknown;
  description?: unknown;
  category?: unknown;
  brand?: unknown;
  supplier?: unknown;
  inventoryUnit?: unknown;
  sellingUnit?: unknown;
  unitRatioToBase?: unknown;
  packageSize?: unknown;
  costPrice?: unknown;
  retailPrice?: unknown;
  wholesalePrice?: unknown;
  vipPrice?: unknown;
  stock?: unknown;
  minimumStock?: unknown;
  taxRate?: unknown;
  status?: unknown;
  expiresAt?: unknown;
  batchNumber?: unknown;
  branch?: unknown;
  location?: unknown;
  notes?: unknown;
};
export type InventoryImportRequest = {
  warehouseId: string;
  mode: InventoryImportMode;
  duplicateAction: InventoryImportDuplicateAction;
  source: { name: string; sizeBytes?: number; fingerprint?: string };
  rows: InventoryImportRowInput[];
};

export type ProductUpdatePayload = ProductCreatePayload & {
  id: string;
};

function getStoredSession() {
  const rawSession = window.localStorage.getItem(sessionKey);
  if (!rawSession) return null;
  const parsed = authSessionSchema.safeParse(JSON.parse(rawSession));
  return parsed.success ? parsed.data : null;
}

export function loadSession() {
  return getStoredSession();
}

export function saveSession(session: AuthSession) {
  window.localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(sessionKey);
}

async function apiRequest(path: string, options: RequestInit = {}) {
  const session = getStoredSession();
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "The request failed.");
  }

  return response.json();
}

async function apiFileRequest(path: string) {
  const session = getStoredSession();
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}) }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "The download failed.");
  }
  return response.blob();
}

export async function fetchHealth(): Promise<ApiHealth> {
  const response = await fetch(`${apiUrl}/api/health`, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error("The API health check failed.");
  }

  return healthSchema.parse(await response.json());
}

export async function fetchSetupStatus() {
  return setupStatusSchema.parse(await apiRequest("/api/auth/setup"));
}

export async function setupOwner(input: { name: string; email: string; password: string; storeName: string }) {
  const session = authSessionSchema.parse(
    await apiRequest("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify(input)
    })
  );
  saveSession(session);
  return session;
}

export async function login(input: { email: string; password: string; rememberMe: boolean }) {
  const session = authSessionSchema.parse(
    await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    })
  );
  saveSession(session);
  return session;
}

export async function fetchCurrentUser() {
  return currentUserSchema.parse(await apiRequest("/api/auth/me"));
}

export async function verifyPassword(input: { password: string }) {
  return passwordVerificationSchema.parse(
    await apiRequest("/api/auth/verify-password", {
      method: "POST",
      body: JSON.stringify(input)
    })
  );
}

export async function fetchUsers() {
  return z.array(managedUserSchema).parse(await apiRequest("/api/users"));
}

export async function createUser(input: { name: string; email: string; password: string; role: "ADMINISTRATOR" | "CASHIER" }) {
  return managedUserSchema.parse(
    await apiRequest("/api/users", {
      method: "POST",
      body: JSON.stringify(input)
    })
  );
}

export async function updateUser(input: { id: string; name?: string; status?: "ACTIVE" | "INACTIVE"; role?: "ADMINISTRATOR" | "CASHIER"; password?: string }) {
  const { id, ...body } = input;
  return managedUserSchema.parse(
    await apiRequest(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    })
  );
}

export async function fetchProducts(search: string, pageSize = 1000) {
  const query = new URLSearchParams({ pageSize: String(pageSize) });
  if (search.trim()) query.set("search", search.trim());
  return productListSchema.parse(await apiRequest(`/api/products?${query.toString()}`));
}

export async function fetchWarehouses() {
  return z.array(warehouseSchema).parse(await apiRequest("/api/inventory/warehouses"));
}

export async function fetchStock(search: string, lowStockOnly = false) {
  const query = new URLSearchParams({ pageSize: "1000", lowStockOnly: String(lowStockOnly) });
  if (search.trim()) query.set("search", search.trim());
  return paginatedStockSchema.parse(await apiRequest(`/api/inventory/stock?${query.toString()}`));
}

export async function fetchInventoryMovements(productId?: string) {
  const query = new URLSearchParams({ pageSize: "1000" });
  if (productId) query.set("productId", productId);
  return paginatedMovementsSchema.parse(await apiRequest(`/api/inventory/movements?${query.toString()}`));
}

export async function createInventoryMovement(input: {
  productId: string;
  warehouseId: string;
  type: "STOCK_IN" | "STOCK_OUT" | "DAMAGE" | "RETURN" | "PURCHASE_RECEIPT";
  quantity: number;
  unitCost?: number | null;
  reason: string;
}) {
  return apiRequest("/api/inventory/movements", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      referenceType: "ManualInventory",
      referenceId: null
    })
  });
}

export async function adjustInventoryCount(input: { productId: string; warehouseId: string; countedQuantity: number; reason: string }) {
  return apiRequest("/api/inventory/counts", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function createSale(input: {
  items: Array<{ productId: string; warehouseId: string; quantity: number; soldUnit?: string; unitPrice?: number; discount: number }>;
  payments: Array<{ method: "CASH" | "GCASH"; amount: number; reference?: string | null }>;
  orderNumber?: string | null;
  orderType?: "RETAIL" | "DINE_IN" | "TAKEOUT" | "DELIVERY" | "WALK_IN" | "COUNTER" | "PICKUP";
  serviceCharge?: number;
  tip?: number;
}) {
  return saleSummarySchema.passthrough().parse(
    await apiRequest("/api/sales", {
      method: "POST",
      body: JSON.stringify({ customerId: null, ...input })
    })
  );
}

export async function fetchSaleReceipt(input: { saleId: string; paperWidth: "58mm" | "80mm" }) {
  const query = new URLSearchParams({ paperWidth: input.paperWidth });
  return receiptSchema.parse(await apiRequest(`/api/receipts/sales/${input.saleId}?${query.toString()}`));
}

export async function requestReceiptPrint(input: {
  saleId: string;
  paperWidth: "58mm" | "80mm";
  printerType: "WINDOWS" | "ESC_POS";
  printerName?: string | null;
}) {
  return receiptSchema.parse(
    await apiRequest(`/api/receipts/sales/${input.saleId}/print`, {
      method: "POST",
      body: JSON.stringify({
        paperWidth: input.paperWidth,
        printerType: input.printerType,
        printerName: input.printerName ?? null
      })
    })
  );
}

export async function fetchReportOverview(input: { period: ReportPeriod; startDate?: string; endDate?: string }) {
  const query = new URLSearchParams({ period: input.period });
  if (input.startDate) query.set("startDate", input.startDate);
  if (input.endDate) query.set("endDate", input.endDate);
  return reportOverviewSchema.parse(await apiRequest(`/api/reports/overview?${query.toString()}`));
}

export async function exportReport(input: { period: ReportPeriod; format: "pdf" | "excel"; startDate?: string; endDate?: string }) {
  const query = new URLSearchParams({ period: input.period, format: input.format });
  if (input.startDate) query.set("startDate", input.startDate);
  if (input.endDate) query.set("endDate", input.endDate);
  return reportExportSchema.parse(await apiRequest(`/api/reports/export?${query.toString()}`));
}

export async function fetchSettings() {
  return appSettingsSchema.parse(await apiRequest("/api/settings"));
}

export async function fetchRuntimeSettings() {
  return runtimeSettingsSchema.parse(await apiRequest("/api/settings/runtime"));
}

export async function fetchRestaurantTables(includeInactive = false) {
  return z.array(restaurantTableSchema).parse(await apiRequest(`/api/restaurant/tables?includeInactive=${includeInactive}`));
}

export async function createRestaurantTable(input: { number: string; section: string; capacity: number; notes?: string | null }) {
  return restaurantTableSchema.parse(await apiRequest("/api/restaurant/tables", { method: "POST", body: JSON.stringify(input) }));
}

export async function updateRestaurantTable(input: { id: string; number?: string; section?: string; capacity?: number; status?: RestaurantTable["status"]; notes?: string | null; isActive?: boolean }) {
  const { id, ...body } = input;
  return restaurantTableSchema.parse(await apiRequest(`/api/restaurant/tables/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
}

export async function disableRestaurantTable(id: string) {
  return restaurantTableSchema.parse(await apiRequest(`/api/restaurant/tables/${id}`, { method: "DELETE" }));
}

export async function fetchRestaurantOrders(input: { search?: string; includeClosed?: boolean } = {}) {
  const query = new URLSearchParams({ pageSize: "200", includeClosed: String(input.includeClosed ?? false) });
  if (input.search?.trim()) query.set("search", input.search.trim());
  return restaurantOrderListSchema.parse(await apiRequest(`/api/restaurant/orders?${query.toString()}`));
}

export async function createRestaurantOrder(input: {
  orderType: RestaurantOrderType;
  primaryTableId?: string | null;
  tableIds?: string[];
  customerName?: string | null;
  customerPhone?: string | null;
  queueNumber?: string | null;
  guestCount: number;
  note?: string | null;
  serviceCharge?: number;
  tip?: number;
  items?: RestaurantOrderItemInput[];
}) {
  return restaurantOrderSchema.parse(await apiRequest("/api/restaurant/orders", { method: "POST", body: JSON.stringify(input) }));
}

export async function acquireRestaurantOrderLock(id: string, expectedVersion?: number) {
  return restaurantOrderSchema.parse(await apiRequest(`/api/restaurant/orders/${id}/lock`, { method: "POST", body: JSON.stringify({ expectedVersion }) }));
}

export async function releaseRestaurantOrderLock(id: string) {
  return z.object({ released: z.boolean() }).parse(await apiRequest(`/api/restaurant/orders/${id}/lock`, { method: "DELETE" }));
}

export async function updateRestaurantOrder(input: {
  id: string;
  expectedVersion: number;
  status?: RestaurantOrderStatus;
  customerName?: string | null;
  customerPhone?: string | null;
  queueNumber?: string | null;
  guestCount?: number;
  note?: string | null;
  serviceCharge?: number;
  tip?: number;
  items?: RestaurantOrderItemInput[];
}) {
  const { id, ...body } = input;
  return restaurantOrderSchema.parse(await apiRequest(`/api/restaurant/orders/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
}

export async function assignRestaurantOrderTables(input: { id: string; expectedVersion: number; tableIds: string[]; primaryTableId: string }) {
  const { id, ...body } = input;
  return restaurantOrderSchema.parse(await apiRequest(`/api/restaurant/orders/${id}/tables`, { method: "PUT", body: JSON.stringify(body) }));
}

export async function cancelRestaurantOrder(input: { id: string; expectedVersion: number; reason: string }) {
  const { id, ...body } = input;
  return restaurantOrderSchema.parse(await apiRequest(`/api/restaurant/orders/${id}/cancel`, { method: "POST", body: JSON.stringify(body) }));
}

export async function reopenRestaurantOrder(input: { id: string; expectedVersion: number }) {
  const { id, ...body } = input;
  return restaurantOrderSchema.parse(await apiRequest(`/api/restaurant/orders/${id}/reopen`, { method: "POST", body: JSON.stringify(body) }));
}

export async function checkoutRestaurantOrder(input: {
  id: string;
  expectedVersion: number;
  serviceCharge?: number;
  tip?: number;
  payments: Array<{ method: "CASH" | "GCASH"; amount: number; reference?: string | null }>;
}) {
  const { id, ...body } = input;
  return saleSummarySchema.passthrough().parse(await apiRequest(`/api/restaurant/orders/${id}/checkout`, { method: "POST", body: JSON.stringify(body) }));
}

export async function updateSettings(input: AppSettings) {
  return appSettingsSchema.parse(
    await apiRequest("/api/settings", {
      method: "PUT",
      body: JSON.stringify(input)
    })
  );
}

export async function fetchBackups() {
  return z.array(backupRunSchema).parse(await apiRequest("/api/settings/backups"));
}

export async function createBackup() {
  return backupRunSchema.parse(await apiRequest("/api/settings/backups", { method: "POST" }));
}

export async function restoreBackup(backupRunId: string) {
  return z.object({ restored: z.boolean(), requiresRestart: z.boolean(), safetyCopy: z.string() }).parse(
    await apiRequest("/api/settings/restore", {
      method: "POST",
      body: JSON.stringify({ backupRunId })
    })
  );
}

export async function createProduct(input: ProductCreatePayload) {
  const barcodes = input.barcode?.trim() ? [{ value: input.barcode.trim(), isPrimary: true }] : [];
  return productSchema.parse(
    await apiRequest("/api/products", {
      method: "POST",
      body: JSON.stringify({
        sku: input.sku?.trim() ? input.sku.trim() : undefined,
        name: input.name,
        variant: input.variant?.trim() ? input.variant.trim() : null,
        salesChannel: input.salesChannel,
        brand: input.brand?.trim() ? input.brand.trim() : null,
        description: null,
        imageUrl: null,
        categoryId: null,
        supplierId: null,
        inventoryUnit: input.inventoryUnit,
        sellingUnit: input.sellingUnit,
        unitRatioToBase: 1,
        costPrice: input.costPrice,
        retailPrice: input.retailPrice,
        wholesalePrice: input.wholesalePrice,
        vipPrice: input.wholesalePrice,
        packageSize: input.packageSize,
        taxRate: 0,
        wholesaleThreshold: input.wholesaleThreshold,
        minimumStock: input.minimumStock,
        maximumStock: null,
        status: "ACTIVE",
        expiresAt: null,
        batchNumber: null,
        location: null,
        notes: null,
        barcodes
      })
    })
  );
}

export async function importProducts(input: { warehouseId?: string; rows: ProductImportPayload[] }) {
  return productImportResultSchema.parse(
    await apiRequest("/api/products/import", {
      method: "POST",
      body: JSON.stringify({
        warehouseId: input.warehouseId,
        rows: input.rows.map((row) => {
          const barcodes = row.barcode?.trim() ? [{ value: row.barcode.trim(), isPrimary: true }] : [];
          return {
            sku: row.sku?.trim() ? row.sku.trim() : undefined,
            name: row.name,
            variant: row.variant?.trim() ? row.variant.trim() : null,
            salesChannel: row.salesChannel,
            brand: row.brand?.trim() ? row.brand.trim() : null,
            description: null,
            imageUrl: null,
            categoryId: null,
            supplierId: null,
            inventoryUnit: row.inventoryUnit,
            sellingUnit: row.sellingUnit,
            unitRatioToBase: 1,
            costPrice: row.costPrice,
            retailPrice: row.retailPrice,
            wholesalePrice: row.wholesalePrice,
            vipPrice: row.wholesalePrice,
            packageSize: row.packageSize,
            taxRate: 0,
            wholesaleThreshold: row.wholesaleThreshold,
            minimumStock: row.minimumStock,
            maximumStock: null,
            status: "ACTIVE",
            expiresAt: null,
            batchNumber: null,
            location: null,
            notes: null,
            barcodes,
            initialStock: row.initialStock,
            unitCost: row.unitCost ?? row.costPrice
          };
        })
      })
    })
  );
}

export async function previewInventoryImport(input: InventoryImportRequest) {
  return inventoryImportPreviewSchema.parse(
    await apiRequest("/api/inventory-imports/preview", { method: "POST", body: JSON.stringify(input) })
  );
}

export async function executeInventoryImport(input: InventoryImportRequest & { previewFingerprint: string }) {
  return inventoryImportBatchSchema.parse(
    await apiRequest("/api/inventory-imports/execute", { method: "POST", body: JSON.stringify(input) })
  );
}

export async function fetchInventoryImports() {
  return inventoryImportListSchema.parse(await apiRequest("/api/inventory-imports?pageSize=50"));
}

export async function fetchInventoryImport(batchId: string) {
  return inventoryImportBatchSchema.parse(await apiRequest(`/api/inventory-imports/${batchId}`));
}

export async function rollbackInventoryImport(batchId: string) {
  return inventoryImportBatchSchema.parse(await apiRequest(`/api/inventory-imports/${batchId}/rollback`, { method: "POST" }));
}

export async function fetchInventoryImportPresets() {
  return z.array(inventoryImportPresetSchema).parse(await apiRequest("/api/inventory-imports/presets"));
}

export async function createInventoryImportPreset(input: { name: string; mapping: Record<string, string> }) {
  return inventoryImportPresetSchema.parse(
    await apiRequest("/api/inventory-imports/presets", { method: "POST", body: JSON.stringify(input) })
  );
}

export async function deleteInventoryImportPreset(presetId: string) {
  return z.object({ success: z.boolean() }).parse(await apiRequest(`/api/inventory-imports/presets/${presetId}`, { method: "DELETE" }));
}

export async function downloadInventoryImportReport(batchId: string) {
  return apiFileRequest(`/api/inventory-imports/${batchId}/report`);
}

export async function updateProduct(input: ProductUpdatePayload) {
  const { id, ...product } = input;
  const barcode = product.barcode?.trim();
  return productSchema.parse(
    await apiRequest(`/api/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        sku: product.sku?.trim() ? product.sku.trim() : undefined,
        name: product.name,
        variant: product.variant?.trim() ? product.variant.trim() : null,
        salesChannel: product.salesChannel,
        brand: product.brand?.trim() ? product.brand.trim() : null,
        inventoryUnit: product.inventoryUnit,
        sellingUnit: product.sellingUnit,
        unitRatioToBase: 1,
        costPrice: product.costPrice,
        retailPrice: product.retailPrice,
        wholesalePrice: product.wholesalePrice,
        vipPrice: product.wholesalePrice,
        packageSize: product.packageSize,
        wholesaleThreshold: product.wholesaleThreshold,
        minimumStock: product.minimumStock,
        barcodes: barcode ? [{ value: barcode, isPrimary: true }] : []
      })
    })
  );
}

export async function deleteProduct(productId: string) {
  return z.object({ success: z.boolean() }).parse(
    await apiRequest(`/api/products/${productId}`, {
      method: "DELETE"
    })
  );
}
