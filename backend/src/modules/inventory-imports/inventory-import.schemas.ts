import { z } from "zod";

export const inventoryImportModeSchema = z.enum([
  "ADD_NEW",
  "UPDATE_EXISTING",
  "ADD_AND_UPDATE",
  "ADD_STOCK",
  "REPLACE_STOCK",
  "ADJUST_STOCK",
  "INITIAL_INVENTORY"
]);

export const duplicateActionSchema = z.enum(["SKIP", "UPDATE", "MERGE", "MANUAL_REVIEW"]);

const rawCell = z.unknown().optional().nullable();

export const inventoryImportRowSchema = z.object({
  rowNumber: z.coerce.number().int().min(1).max(1_000_000),
  productId: rawCell,
  sku: rawCell,
  barcode: rawCell,
  name: rawCell,
  variant: rawCell,
  salesChannel: rawCell,
  description: rawCell,
  category: rawCell,
  brand: rawCell,
  supplier: rawCell,
  inventoryUnit: rawCell,
  sellingUnit: rawCell,
  unitRatioToBase: rawCell,
  packageSize: rawCell,
  costPrice: rawCell,
  retailPrice: rawCell,
  wholesalePrice: rawCell,
  vipPrice: rawCell,
  stock: rawCell,
  minimumStock: rawCell,
  taxRate: rawCell,
  status: rawCell,
  expiresAt: rawCell,
  batchNumber: rawCell,
  branch: rawCell,
  location: rawCell,
  notes: rawCell
});

const importSourceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  sizeBytes: z.coerce.number().int().min(0).max(100_000_000).optional(),
  fingerprint: z.string().trim().min(8).max(128).optional()
});

const importRequestBaseSchema = z
  .object({
    warehouseId: z.string().trim().min(1),
    mode: inventoryImportModeSchema,
    duplicateAction: duplicateActionSchema.default("MANUAL_REVIEW"),
    source: importSourceSchema,
    rows: z.array(inventoryImportRowSchema).min(1).max(10_000)
  })
  .superRefine((input, context) => {
    const seen = new Set<number>();
    for (const [index, row] of input.rows.entries()) {
      if (seen.has(row.rowNumber)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["rows", index, "rowNumber"], message: "Row numbers must be unique." });
      }
      seen.add(row.rowNumber);
    }
  });

export const inventoryImportPreviewSchema = importRequestBaseSchema;

export const inventoryImportExecuteSchema = importRequestBaseSchema.and(
  z.object({ previewFingerprint: z.string().trim().length(64) })
);

export const inventoryImportListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  status: z.enum(["PROCESSING", "COMPLETED", "PARTIAL", "FAILED", "ROLLED_BACK"]).optional()
});

export const inventoryImportIdSchema = z.object({ id: z.string().trim().min(1) });

export const inventoryImportPresetCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  mapping: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(80)).refine((mapping) => Object.keys(mapping).length <= 64, {
    message: "A mapping preset cannot contain more than 64 columns."
  })
});

export type InventoryImportMode = z.infer<typeof inventoryImportModeSchema>;
export type DuplicateAction = z.infer<typeof duplicateActionSchema>;
export type InventoryImportRawRow = z.infer<typeof inventoryImportRowSchema>;
export type InventoryImportPreviewInput = z.infer<typeof inventoryImportPreviewSchema>;
export type InventoryImportExecuteInput = z.infer<typeof inventoryImportExecuteSchema>;
export type InventoryImportListQuery = z.infer<typeof inventoryImportListQuerySchema>;
export type InventoryImportPresetCreateInput = z.infer<typeof inventoryImportPresetCreateSchema>;
