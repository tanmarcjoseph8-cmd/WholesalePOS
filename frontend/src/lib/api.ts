import { z } from "zod";

const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string()
});

export type ApiHealth = z.infer<typeof healthSchema>;

const apiUrl = import.meta.env.VITE_API_URL ?? "";
const sessionKey = "wholesalepos.session";

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

const productSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  inventoryUnit: z.string(),
  sellingUnit: z.string(),
  retailPrice: z.coerce.number(),
  wholesalePrice: z.coerce.number(),
  costPrice: z.coerce.number(),
  minimumStock: z.coerce.number(),
  status: z.string(),
  barcodes: z.array(z.object({ id: z.string(), value: z.string(), isPrimary: z.boolean() })).default([])
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

const paginatedStockSchema = z.object({
  items: z.array(inventoryStockSchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() })
});

const paginatedMovementsSchema = z.object({
  items: z.array(inventoryMovementSchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() })
});

export type AuthSession = z.infer<typeof authSessionSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type ManagedUser = z.infer<typeof managedUserSchema>;
export type Product = z.infer<typeof productSchema>;
export type Warehouse = z.infer<typeof warehouseSchema>;
export type InventoryStock = z.infer<typeof inventoryStockSchema>;
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;

export type ProductCreatePayload = {
  sku: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  minimumStock: number;
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

export async function fetchProducts(search: string) {
  const query = new URLSearchParams({ pageSize: "50" });
  if (search.trim()) query.set("search", search.trim());
  return productListSchema.parse(await apiRequest(`/api/products?${query.toString()}`));
}

export async function fetchWarehouses() {
  return z.array(warehouseSchema).parse(await apiRequest("/api/inventory/warehouses"));
}

export async function fetchStock(search: string, lowStockOnly = false) {
  const query = new URLSearchParams({ pageSize: "100", lowStockOnly: String(lowStockOnly) });
  if (search.trim()) query.set("search", search.trim());
  return paginatedStockSchema.parse(await apiRequest(`/api/inventory/stock?${query.toString()}`));
}

export async function fetchInventoryMovements(productId?: string) {
  const query = new URLSearchParams({ pageSize: "50" });
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
  items: Array<{ productId: string; warehouseId: string; quantity: number; unitPrice: number; discount: number }>;
  payments: Array<{ method: "CASH" | "GCASH"; amount: number; reference?: string | null }>;
}) {
  return apiRequest("/api/sales", {
    method: "POST",
    body: JSON.stringify({ customerId: null, ...input })
  });
}

export async function createProduct(input: ProductCreatePayload) {
  const barcodes = input.barcode?.trim() ? [{ value: input.barcode.trim(), isPrimary: true }] : [];
  return productSchema.parse(
    await apiRequest("/api/products", {
      method: "POST",
      body: JSON.stringify({
        sku: input.sku,
        name: input.name,
        brand: input.brand?.trim() ? input.brand.trim() : null,
        description: null,
        imageUrl: null,
        categoryId: null,
        supplierId: null,
        inventoryUnit: "PIECE",
        sellingUnit: "PIECE",
        unitRatioToBase: 1,
        costPrice: input.costPrice,
        retailPrice: input.retailPrice,
        wholesalePrice: input.wholesalePrice,
        vipPrice: input.wholesalePrice,
        taxRate: 0,
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
