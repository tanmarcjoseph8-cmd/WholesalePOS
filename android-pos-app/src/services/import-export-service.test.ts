import { describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../data/database";
import type { LocalUser } from "../domain/models";
import { ImportExportService, type ImportPreview } from "./import-export-service";

describe("ImportExportService scalable batches", () => {
  it("imports validated rows in bounded native batches with progress", async () => {
    const executeSet = vi.fn().mockResolvedValue({ changes: { changes: 1 } });
    const run = vi.fn().mockResolvedValue({ changes: { changes: 1 } });
    const query = vi.fn().mockImplementation((sql: string) => Promise.resolve(sql.includes("import_batches") ? [] : []));
    const db = { query, run, executeSet, transaction: async <T>(operation: () => Promise<T>) => operation() } as unknown as LocalDatabase;
    const service = new ImportExportService(db, {} as never, {} as never);
    const rows = Array.from({ length: 500 }, (_, index) => ({ rowNumber: index + 2, sku: `SKU-${index}`, barcode: null, name: `Product ${index}`, inventoryUnit: "PIECE" as const, sellingUnit: "PIECE" as const, costPriceCents: 100, retailPriceCents: 200, wholesalePriceCents: 180, startingStockMicro: 0, minimumStockMicro: 0, errors: [] }));
    const preview: ImportPreview = { sourceName: "large.csv", fingerprint: "fingerprint", rows, validCount: rows.length, invalidCount: 0 };
    const progress: number[] = [];
    const actor = { id: "owner", permissions: ["*"], role: "OWNER", name: "Owner", login: "owner" } satisfies LocalUser;
    const result = await service.executeProductImport(actor, preview, "UPDATE", { onProgress: (value) => progress.push(value.processed) });
    expect(result.created).toBe(500);
    expect(executeSet).toHaveBeenCalledTimes(2);
    expect(progress).toEqual([250, 500]);
  });
});
