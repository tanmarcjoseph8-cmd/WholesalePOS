import { z } from "zod";

const unitTypeSchema = z.enum([
  "KILOGRAM",
  "GRAM",
  "LITER",
  "MILLILITER",
  "METER",
  "CENTIMETER",
  "PIECE",
  "PACK",
  "CASE",
  "BUNDLE",
  "BOTTLE",
  "ROLL",
  "CUSTOM"
]);

const productStatusSchema = z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]);

const nullableText = z.string().trim().min(1).max(500).optional().nullable();
const money = z.coerce.number().finite().min(0).max(999_999_999.99);
const decimalQuantity = z.coerce.number().finite().min(0).max(999_999_999.999999);

const barcodeSchema = z.object({
  value: z.string().trim().min(3).max(64),
  isPrimary: z.boolean().default(false)
});

export const productCreateSchema = z.object({
  sku: z.string().trim().min(2).max(64).optional(),
  name: z.string().trim().min(2).max(160),
  description: nullableText,
  imageUrl: z.string().trim().url().optional().nullable(),
  brand: nullableText,
  categoryId: z.string().trim().min(1).optional().nullable(),
  supplierId: z.string().trim().min(1).optional().nullable(),
  inventoryUnit: unitTypeSchema,
  sellingUnit: unitTypeSchema,
  unitRatioToBase: z.coerce.number().finite().positive().max(999_999.999999).default(1),
  packageSize: z.coerce.number().finite().positive().max(999_999.999999).default(1),
  costPrice: money,
  retailPrice: money,
  wholesalePrice: money,
  vipPrice: money,
  wholesaleThreshold: decimalQuantity.default(0),
  taxRate: z.coerce.number().finite().min(0).max(1).default(0),
  minimumStock: decimalQuantity.default(0),
  maximumStock: decimalQuantity.optional().nullable(),
  status: productStatusSchema.default("ACTIVE"),
  expiresAt: z.coerce.date().optional().nullable(),
  batchNumber: nullableText,
  location: nullableText,
  notes: nullableText,
  barcodes: z.array(barcodeSchema).max(20).default([])
});

export const productUpdateSchema = productCreateSchema
  .partial()
  .extend({
    barcodes: z.array(barcodeSchema).max(20).optional()
  })
  .refine((input) => Object.keys(input).length > 0, "At least one field is required.");

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: productStatusSchema.optional(),
  categoryId: z.string().trim().min(1).optional(),
  supplierId: z.string().trim().min(1).optional()
});

export const productIdParamSchema = z.object({
  id: z.string().trim().min(1)
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
