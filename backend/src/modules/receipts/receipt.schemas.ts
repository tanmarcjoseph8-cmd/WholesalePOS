import { z } from "zod";

export const saleReceiptParamSchema = z.object({
  saleId: z.string().trim().min(1)
});

export const receiptQuerySchema = z.object({
  paperWidth: z.enum(["58mm", "80mm"]).default("80mm")
});

export const receiptPrintSchema = z.object({
  paperWidth: z.enum(["58mm", "80mm"]).default("80mm"),
  printerType: z.enum(["WINDOWS", "ESC_POS"]).default("WINDOWS"),
  printerName: z.string().trim().min(1).max(160).optional().nullable()
});

export type ReceiptPaperWidth = z.infer<typeof receiptQuerySchema>["paperWidth"];
export type ReceiptPrintInput = z.infer<typeof receiptPrintSchema>;
