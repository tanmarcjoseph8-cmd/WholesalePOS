import { z } from "zod";

export const settingsUpdateSchema = z.object({
  businessMode: z.object({ mode: z.enum(["RETAIL", "RESTAURANT", "HYBRID"]) }).optional(),
  business: z
    .object({
      name: z.string().trim().min(1).max(160),
      phone: z.string().trim().max(80).optional(),
      email: z.string().trim().email().optional().or(z.literal("")),
      address: z.string().trim().max(500).optional()
    })
    .optional(),
  tax: z.object({ vatRate: z.coerce.number().min(0).max(1), pricesIncludeVat: z.boolean() }).optional(),
  receipt: z.object({ footer: z.string().trim().max(240), paperWidth: z.enum(["58mm", "80mm"]) }).optional(),
  printer: z.object({ printerName: z.string().trim().max(160), printerType: z.enum(["WINDOWS", "ESC_POS"]) }).optional(),
  theme: z.object({ mode: z.enum(["light", "dark", "system"]) }).optional(),
  backup: z.object({ automaticBackupsEnabled: z.boolean(), retentionDays: z.coerce.number().int().min(1).max(365) }).optional(),
  inventoryImport: z
    .object({
      batchSize: z.coerce.number().int().min(25).max(1000),
      preventDuplicateFiles: z.boolean(),
      defaultMode: z.enum(["ADD_NEW", "UPDATE_EXISTING", "ADD_AND_UPDATE", "ADD_STOCK", "REPLACE_STOCK", "ADJUST_STOCK", "INITIAL_INVENTORY"])
    })
    .optional(),
  restaurant: z
    .object({
      enableTables: z.boolean(),
      allowWalkInOrders: z.boolean(),
      enableDelivery: z.boolean(),
      enableTakeout: z.boolean(),
      enableKitchenTickets: z.boolean(),
      serviceChargeRate: z.coerce.number().min(0).max(1),
      splitBilling: z.boolean(),
      partialPayments: z.boolean(),
      orderNumberFormat: z.string().trim().min(3).max(60)
    })
    .optional()
});

export const restoreBackupSchema = z.object({
  backupRunId: z.string().trim().min(1)
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
