import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    warehouse: { findFirst: vi.fn() },
    product: { findMany: vi.fn() },
    inventoryImportBatch: { findFirst: vi.fn() }
  }
}));

vi.mock("../src/config/prisma.js", () => ({ prisma: mocks.prisma }));

import { previewInventoryImport } from "../src/modules/inventory-imports/inventory-import.preview.js";
import { inventoryImportPreviewSchema } from "../src/modules/inventory-imports/inventory-import.schemas.js";

const actor = { userId: "user-1", storeId: "store-1" };
const warehouse = { id: "warehouse-1", code: "MAIN", name: "Main Warehouse" };
const product = {
  id: "product-1",
  categoryId: null,
  supplierId: null,
  sku: "STEEL-1",
  name: "Steel Bar",
  variant: "10mm",
  salesChannel: "RETAIL",
  description: null,
  imageUrl: null,
  brand: null,
  inventoryUnit: "PIECE",
  sellingUnit: "PIECE",
  unitRatioToBase: 1,
  packageSize: 1,
  costPrice: 100,
  retailPrice: 120,
  wholesalePrice: 110,
  vipPrice: 110,
  wholesaleThreshold: 0,
  taxRate: 0,
  minimumStock: 2,
  maximumStock: null,
  status: "ACTIVE",
  expiresAt: null,
  batchNumber: null,
  location: null,
  notes: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  deletedAt: null,
  barcodes: [{ id: "barcode-1", productId: "product-1", value: "123456", isPrimary: true, createdAt: new Date() }],
  stocks: [{ id: "stock-1", productId: "product-1", warehouseId: "warehouse-1", quantity: 5, updatedAt: new Date() }],
  category: null,
  supplier: null
};

function input(overrides: Record<string, unknown> = {}) {
  return inventoryImportPreviewSchema.parse({
    warehouseId: warehouse.id,
    mode: "ADD_STOCK",
    duplicateAction: "MANUAL_REVIEW",
    source: { name: "stock.xlsx", fingerprint: "client-file-hash" },
    rows: [{ rowNumber: 2, sku: product.sku, stock: 2 }],
    ...overrides
  });
}

describe("inventory import preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.warehouse.findFirst.mockResolvedValue(warehouse);
    mocks.prisma.product.findMany.mockResolvedValue([product]);
    mocks.prisma.inventoryImportBatch.findFirst.mockResolvedValue(null);
  });

  it("matches an existing product by SKU and calculates additive stock", async () => {
    const result = await previewInventoryImport(input(), actor);

    expect(result.rows[0]).toMatchObject({
      status: "VALID",
      action: "STOCK",
      matchMethod: "SKU",
      previousStock: 5,
      stockDelta: 2,
      matchedProduct: { id: product.id }
    });
    expect(result.summary).toMatchObject({ validCount: 1, stockCount: 1, stockDelta: 2 });
    expect(result.fingerprint).toHaveLength(64);
  });

  it("requires manual confirmation for product-name-only matching", async () => {
    const result = await previewInventoryImport(
      input({ mode: "ADD_AND_UPDATE", rows: [{ rowNumber: 2, name: "Steel Bar", retailPrice: 130 }] }),
      actor
    );

    expect(result.rows[0]).toMatchObject({ status: "WARNING", action: "REVIEW", matchMethod: undefined });
    expect(result.rows[0]?.warnings.join(" ")).toContain("manual review");
  });

  it("rejects duplicate SKUs and multiple rows that resolve to the same product", async () => {
    const result = await previewInventoryImport(
      input({
        rows: [
          { rowNumber: 2, sku: product.sku, stock: 2 },
          { rowNumber: 3, sku: product.sku, stock: 3 }
        ]
      }),
      actor
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.status === "INVALID" && row.action === "INVALID")).toBe(true);
    expect(result.rows[0]?.errors.join(" ")).toContain("duplicated");
  });

  it("normalizes percentage tax while retaining a warning", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([]);
    const result = await previewInventoryImport(
      input({ mode: "ADD_NEW", rows: [{ rowNumber: 2, name: "New Product", taxRate: 12, stock: 1 }] }),
      actor
    );

    expect(result.rows[0]?.normalized.taxRate).toBe(0.12);
    expect(result.rows[0]).toMatchObject({ status: "WARNING", action: "CREATE" });
  });

  it("prevents adjustments that would make stock negative", async () => {
    const result = await previewInventoryImport(input({ mode: "ADJUST_STOCK", rows: [{ rowNumber: 2, barcode: "123456", stock: -6 }] }), actor);

    expect(result.rows[0]).toMatchObject({ status: "INVALID", action: "INVALID", matchMethod: "BARCODE" });
    expect(result.rows[0]?.errors.join(" ")).toContain("negative");
  });

  it("rejects duplicate spreadsheet row numbers structurally", () => {
    expect(() =>
      inventoryImportPreviewSchema.parse({
        warehouseId: warehouse.id,
        mode: "ADD_NEW",
        source: { name: "rows.csv" },
        rows: [
          { rowNumber: 2, name: "A" },
          { rowNumber: 2, name: "B" }
        ]
      })
    ).toThrow("Row numbers must be unique");
  });
});
