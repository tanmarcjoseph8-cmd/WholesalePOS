import { z } from "zod";

const unitTypeSchema = z.enum([
  "KILOGRAM",
  "GRAM",
  "LITER",
  "MILLILITER",
  "METER",
  "YARD",
  "CENTIMETER",
  "PIECE",
  "PACK",
  "CASE",
  "BUNDLE",
  "BOTTLE",
  "ROLL",
  "CUSTOM"
]);

export const saleCreateSchema = z.object({
  customerId: z.string().trim().min(1).optional().nullable(),
  orderNumber: z.string().trim().min(1).max(80).optional().nullable(),
  orderType: z.enum(["RETAIL", "DINE_IN", "TAKEOUT", "DELIVERY", "WALK_IN", "COUNTER", "PICKUP", "OTHER"]).default("RETAIL"),
  customOrderType: z.string().trim().min(1).max(60).optional().nullable(),
  serviceCharge: z.coerce.number().finite().min(0).max(999_999_999.99).default(0),
  tip: z.coerce.number().finite().min(0).max(999_999_999.99).default(0),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        warehouseId: z.string().trim().min(1),
        quantity: z.coerce.number().finite().positive().max(999_999_999.999999),
        soldUnit: unitTypeSchema.optional(),
        unitPrice: z.coerce.number().finite().min(0).max(999_999_999.99).optional(),
        discount: z.coerce.number().finite().min(0).max(999_999_999.99).default(0)
      })
    )
    .min(1),
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "GCASH"]),
        amount: z.coerce.number().finite().positive().max(999_999_999.99),
        reference: z.string().trim().min(1).max(120).optional().nullable()
      })
    )
    .min(1)
});

export const saleListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(1000).default(25),
  orderType: z.enum(["RETAIL", "DINE_IN", "TAKEOUT", "DELIVERY", "WALK_IN", "COUNTER", "PICKUP", "OTHER"]).optional()
});

export type SaleCreateInput = z.infer<typeof saleCreateSchema>;
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;
