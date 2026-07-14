import { z } from "zod";

const paymentSchema = z.object({
  method: z.enum(["CASH", "GCASH"]),
  amount: z.coerce.number().finite().positive().max(999_999_999.99),
  reference: z.string().trim().min(1).max(120).optional().nullable()
});

const reversalBaseSchema = z.object({
  requestKey: z.string().trim().min(8).max(120).optional(),
  reason: z.string().trim().min(3).max(500),
  payments: z.array(paymentSchema).max(20).optional()
});

export const saleRefundSchema = reversalBaseSchema.extend({
  items: z.array(z.object({
    saleItemId: z.string().trim().min(1),
    quantity: z.coerce.number().finite().positive().max(999_999_999.999999)
  })).min(1).max(500)
});

export const saleVoidSchema = reversalBaseSchema;

export type SaleRefundInput = z.infer<typeof saleRefundSchema>;
export type SaleVoidInput = z.infer<typeof saleVoidSchema>;
