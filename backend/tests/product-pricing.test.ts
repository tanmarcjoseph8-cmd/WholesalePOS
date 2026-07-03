import { describe, expect, it } from "vitest";
import { findPriceChanges } from "../src/modules/products/product-pricing.js";

describe("product price change tracking", () => {
  it("returns one audit row for every changed price field", () => {
    expect(
      findPriceChanges(
        { costPrice: 40, retailPrice: 60, wholesalePrice: 55, vipPrice: 50 },
        { retailPrice: 62, vipPrice: 49 }
      )
    ).toEqual([
      { priceType: "retailPrice", oldPrice: 60, newPrice: 62 },
      { priceType: "vipPrice", oldPrice: 50, newPrice: 49 }
    ]);
  });

  it("ignores unchanged or omitted prices", () => {
    expect(
      findPriceChanges(
        { costPrice: 40, retailPrice: 60, wholesalePrice: 55, vipPrice: 50 },
        { retailPrice: 60 }
      )
    ).toEqual([]);
  });
});
