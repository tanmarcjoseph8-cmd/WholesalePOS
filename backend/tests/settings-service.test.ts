import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    setting: { findMany: vi.fn() }
  }
}));

vi.mock("../src/config/prisma.js", () => ({ prisma: mocks.prisma }));

import { getSettings } from "../src/modules/settings/setting.service.js";

describe("settings service defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds retail-safe defaults when an existing store has no new mode settings", async () => {
    mocks.prisma.setting.findMany.mockResolvedValue([]);

    const settings = await getSettings({ userId: "user-1", storeId: "store-1" });

    expect(settings.businessMode).toEqual({ mode: "RETAIL" });
    expect(settings.inventoryImport).toEqual({
      batchSize: 250,
      preventDuplicateFiles: true,
      defaultMode: "ADD_AND_UPDATE"
    });
    expect(settings.restaurant).toMatchObject({
      enableTables: true,
      allowWalkInOrders: true,
      enableDelivery: false,
      enableTakeout: true,
      serviceChargeRate: 0
    });
  });
});
