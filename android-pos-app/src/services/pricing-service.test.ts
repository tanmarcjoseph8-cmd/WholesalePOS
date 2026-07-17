import { describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../data/database";
import { PricingService } from "./pricing-service";

describe("PricingService", () => {
  it("prefers a matching effective quantity rule", async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([{ price_cents: 7500 }]) } as unknown as LocalDatabase;
    await expect(new PricingService(db).resolve("p1", "DISTRIBUTOR", 10_000_000, "2026-07-18T00:00:00.000Z")).resolves.toBe(7500);
  });

  it("preserves the existing wholesale fallback", async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ retail_price_cents: 10000, wholesale_price_cents: 8500, wholesale_threshold_micro: 5_000_000 }]) } as unknown as LocalDatabase;
    await expect(new PricingService(db).resolve("p1", "AUTO", 6_000_000)).resolves.toBe(8500);
  });
});
