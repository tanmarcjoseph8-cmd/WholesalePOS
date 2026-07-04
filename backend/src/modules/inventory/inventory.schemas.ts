import { z } from "zod";

const movementTypeSchema = z.enum(["STOCK_IN", "STOCK_OUT", "ADJUSTMENT", "DAMAGE", "RETURN", "PURCHASE_RECEIPT"]);
const quantitySchema = z.coerce.number().finite().positive().max(999_999_999.999999);

export const inventoryMovementCreateSchema = z.object({
  productId: z.string().trim().min(1),
  warehouseId: z.string().trim().min(1),
  type: movementTypeSchema,
  quantity: quantitySchema,
  unitCost: z.coerce.number().finite().min(0).max(999_999_999.99).optional().nullable(),
  referenceType: z.string().trim().min(1).max(80).optional().nullable(),
  referenceId: z.string().trim().min(1).max(120).optional().nullable(),
  reason: z.string().trim().min(3).max(500)
});

export const inventoryCountAdjustmentSchema = z.object({
  productId: z.string().trim().min(1),
  warehouseId: z.string().trim().min(1),
  countedQuantity: z.coerce.number().finite().min(0).max(999_999_999.999999),
  reason: z.string().trim().min(3).max(500)
});

export const inventoryTransferSchema = z.object({
  productId: z.string().trim().min(1),
  fromWarehouseId: z.string().trim().min(1),
  toWarehouseId: z.string().trim().min(1),
  quantity: quantitySchema,
  reason: z.string().trim().min(3).max(500)
}).refine((input) => input.fromWarehouseId !== input.toWarehouseId, {
  message: "Transfer warehouses must be different.",
  path: ["toWarehouseId"]
});

export const inventoryListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(1000).default(25),
  productId: z.string().trim().min(1).optional(),
  warehouseId: z.string().trim().min(1).optional(),
  search: z.string().trim().max(120).optional(),
  lowStockOnly: z.coerce.boolean().default(false)
});

export const movementListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(1000).default(25),
  productId: z.string().trim().min(1).optional(),
  warehouseId: z.string().trim().min(1).optional(),
  type: z.enum(["STOCK_IN", "STOCK_OUT", "ADJUSTMENT", "DAMAGE", "RETURN", "TRANSFER", "SALE", "PURCHASE_RECEIPT"]).optional()
});

export type InventoryMovementCreateInput = z.infer<typeof inventoryMovementCreateSchema>;
export type InventoryCountAdjustmentInput = z.infer<typeof inventoryCountAdjustmentSchema>;
export type InventoryTransferInput = z.infer<typeof inventoryTransferSchema>;
export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;
export type MovementListQuery = z.infer<typeof movementListQuerySchema>;
