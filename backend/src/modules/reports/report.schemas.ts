import { z } from "zod";

export const reportQuerySchema = z.object({
  period: z.enum(["daily", "weekly", "monthly", "custom"]).default("daily"),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional()
});

export const reportExportQuerySchema = reportQuerySchema.extend({
  format: z.enum(["pdf", "excel"]).default("excel")
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
