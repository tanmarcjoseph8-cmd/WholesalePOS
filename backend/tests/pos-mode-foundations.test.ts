import { describe, expect, it } from "vitest";
import { productCreateSchema } from "../src/modules/products/product.schemas.js";
import { saleCreateSchema } from "../src/modules/sales/sale.schemas.js";
import { settingsUpdateSchema } from "../src/modules/settings/setting.schemas.js";

const productInput = {
  name: "Steel bar",
  inventoryUnit: "PIECE" as const,
  sellingUnit: "PIECE" as const,
  costPrice: 100,
  retailPrice: 120,
  wholesalePrice: 110,
  vipPrice: 105
};

describe("POS mode foundations", () => {
  it("keeps existing and newly parsed products retail-only by default", () => {
    const product = productCreateSchema.parse(productInput);

    expect(product.salesChannel).toBe("RETAIL");
    expect(product.variant).toBeUndefined();
  });

  it("accepts explicit restaurant product variants without changing inventory fields", () => {
    const product = productCreateSchema.parse({
      ...productInput,
      name: "Burger",
      variant: "Double",
      salesChannel: "RESTAURANT"
    });

    expect(product).toMatchObject({
      name: "Burger",
      variant: "Double",
      salesChannel: "RESTAURANT",
      inventoryUnit: "PIECE"
    });
  });

  it("keeps existing checkout payloads as retail sales with no added charges", () => {
    const sale = saleCreateSchema.parse({
      items: [{ productId: "product-1", warehouseId: "warehouse-1", quantity: 1, discount: 0 }],
      payments: [{ method: "CASH", amount: 120 }]
    });

    expect(sale).toMatchObject({ orderType: "RETAIL", serviceCharge: 0, tip: 0 });
  });

  it("validates business mode, import, and restaurant settings", () => {
    const settings = settingsUpdateSchema.parse({
      businessMode: { mode: "HYBRID" },
      inventoryImport: { batchSize: 250, preventDuplicateFiles: true, defaultMode: "ADD_AND_UPDATE" },
      restaurant: {
        enableTables: true,
        allowWalkInOrders: true,
        enableDelivery: true,
        enableTakeout: true,
        enableKitchenTickets: true,
        serviceChargeRate: 0.1,
        splitBilling: true,
        partialPayments: true,
        orderNumberFormat: "{TYPE}-{NUMBER}"
      }
    });

    expect(settings.businessMode?.mode).toBe("HYBRID");
    expect(settings.inventoryImport?.batchSize).toBe(250);
    expect(settings.restaurant?.serviceChargeRate).toBe(0.1);
  });

  it("rejects unsafe import and service-charge settings", () => {
    expect(() =>
      settingsUpdateSchema.parse({
        inventoryImport: { batchSize: 5000, preventDuplicateFiles: true, defaultMode: "ADD_AND_UPDATE" }
      })
    ).toThrow();
    expect(() =>
      settingsUpdateSchema.parse({
        restaurant: {
          enableTables: true,
          allowWalkInOrders: true,
          enableDelivery: true,
          enableTakeout: true,
          enableKitchenTickets: true,
          serviceChargeRate: 1.5,
          splitBilling: true,
          partialPayments: true,
          orderNumberFormat: "{TYPE}-{NUMBER}"
        }
      })
    ).toThrow();
  });
});
