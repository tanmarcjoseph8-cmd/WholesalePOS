import { z } from "zod";

export const restaurantTableStatusSchema = z.enum([
  "AVAILABLE",
  "OCCUPIED",
  "RESERVED",
  "AWAITING_ORDER",
  "PREPARING",
  "SERVED",
  "AWAITING_PAYMENT",
  "CLEANING"
]);

export const restaurantOrderTypeSchema = z.enum(["DINE_IN", "WALK_IN", "COUNTER", "TAKEOUT", "PICKUP", "DELIVERY"]);
export const restaurantOrderStatusSchema = z.enum(["DRAFT", "OPEN", "PREPARING", "READY", "SERVED", "PAID", "COMPLETED", "CANCELLED"]);

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

const nullableText = (maximum: number) => z.string().trim().max(maximum).optional().nullable();

export const restaurantTableCreateSchema = z.object({
  number: z.string().trim().min(1).max(40),
  section: z.string().trim().min(1).max(80).default("Main"),
  capacity: z.coerce.number().int().min(1).max(100).default(2),
  status: restaurantTableStatusSchema.default("AVAILABLE"),
  notes: nullableText(500)
});

export const restaurantTableUpdateSchema = restaurantTableCreateSchema.partial().extend({
  isActive: z.boolean().optional()
});

export const restaurantTableListQuerySchema = z.object({
  includeInactive: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .default(false),
  section: z.string().trim().max(80).optional()
});

export const restaurantOrderItemSchema = z.object({
  productId: z.string().trim().min(1),
  warehouseId: z.string().trim().min(1),
  quantity: z.coerce.number().finite().positive().max(999_999_999.999999),
  soldUnit: unitTypeSchema.optional(),
  unitPrice: z.coerce.number().finite().min(0).max(999_999_999.99).optional(),
  discount: z.coerce.number().finite().min(0).max(999_999_999.99).default(0),
  note: nullableText(500)
});

export const restaurantOrderCreateSchema = z.object({
  orderType: restaurantOrderTypeSchema.default("WALK_IN"),
  primaryTableId: z.string().trim().min(1).optional().nullable(),
  tableIds: z.array(z.string().trim().min(1)).max(20).default([]),
  customerId: z.string().trim().min(1).optional().nullable(),
  customerName: nullableText(160),
  customerPhone: nullableText(80),
  queueNumber: nullableText(40),
  guestCount: z.coerce.number().int().min(1).max(500).default(1),
  note: nullableText(1000),
  serviceCharge: z.coerce.number().finite().min(0).max(999_999_999.99).default(0),
  tip: z.coerce.number().finite().min(0).max(999_999_999.99).default(0),
  items: z.array(restaurantOrderItemSchema).max(500).default([])
});

export const restaurantOrderUpdateSchema = restaurantOrderCreateSchema
  .omit({ orderType: true, primaryTableId: true, tableIds: true })
  .partial()
  .extend({
    expectedVersion: z.coerce.number().int().positive(),
    status: restaurantOrderStatusSchema.optional()
  });

export const restaurantOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  status: restaurantOrderStatusSchema.optional(),
  orderType: restaurantOrderTypeSchema.optional(),
  search: z.string().trim().max(120).default(""),
  includeClosed: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .default(false)
});

export const restaurantOrderLockSchema = z.object({
  expectedVersion: z.coerce.number().int().positive().optional()
});

export const restaurantOrderTableAssignmentSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  tableIds: z.array(z.string().trim().min(1)).min(1).max(20),
  primaryTableId: z.string().trim().min(1)
});

export const restaurantOrderCancelSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(500)
});

export const restaurantOrderReopenSchema = z.object({
  expectedVersion: z.coerce.number().int().positive()
});

export const restaurantOrderCheckoutSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  serviceCharge: z.coerce.number().finite().min(0).max(999_999_999.99).optional(),
  tip: z.coerce.number().finite().min(0).max(999_999_999.99).optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "GCASH"]),
        amount: z.coerce.number().finite().positive().max(999_999_999.99),
        reference: nullableText(120)
      })
    )
    .min(1)
});

export type RestaurantTableCreateInput = z.infer<typeof restaurantTableCreateSchema>;
export type RestaurantTableUpdateInput = z.infer<typeof restaurantTableUpdateSchema>;
export type RestaurantTableListQuery = z.infer<typeof restaurantTableListQuerySchema>;
export type RestaurantOrderCreateInput = z.infer<typeof restaurantOrderCreateSchema>;
export type RestaurantOrderUpdateInput = z.infer<typeof restaurantOrderUpdateSchema>;
export type RestaurantOrderListQuery = z.infer<typeof restaurantOrderListQuerySchema>;
export type RestaurantOrderTableAssignmentInput = z.infer<typeof restaurantOrderTableAssignmentSchema>;
export type RestaurantOrderCancelInput = z.infer<typeof restaurantOrderCancelSchema>;
export type RestaurantOrderCheckoutInput = z.infer<typeof restaurantOrderCheckoutSchema>;
