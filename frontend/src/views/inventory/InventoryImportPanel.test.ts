import { describe, expect, it } from "vitest";
import { detectImportMapping, mapInventoryImportRows } from "./InventoryImportPanel";

describe("inventory import spreadsheet mapping", () => {
  it("detects common Excel and supplier column labels", () => {
    expect(detectImportMapping(["Item Code", "Product Name", "Qty", "Selling Price", "Warehouse"])).toEqual({
      "Item Code": "sku",
      "Product Name": "name",
      Qty: "stock",
      "Selling Price": "retailPrice",
      Warehouse: "branch"
    });
  });

  it("maps spreadsheet cells without coercing invalid values in the browser", () => {
    const rows = mapInventoryImportRows(
      [{ Item: "Steel Bar", Price: "not-a-number", Quantity: "12.5" }],
      ["Item", "Price", "Quantity"],
      { Item: "name", Price: "retailPrice", Quantity: "stock" }
    );

    expect(rows).toEqual([{ rowNumber: 2, name: "Steel Bar", retailPrice: "not-a-number", stock: "12.5" }]);
  });

  it("ignores unmapped columns and retains stable spreadsheet row numbers", () => {
    const rows = mapInventoryImportRows(
      [{ Name: "A", Internal: "hidden" }, { Name: "B", Internal: "hidden" }],
      ["Name", "Internal"],
      { Name: "name", Internal: "" }
    );

    expect(rows).toEqual([
      { rowNumber: 2, name: "A" },
      { rowNumber: 3, name: "B" }
    ]);
  });
});
