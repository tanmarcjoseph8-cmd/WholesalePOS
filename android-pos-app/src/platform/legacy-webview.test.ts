import { describe, expect, it } from "vitest";
import { fromEntriesCompat, replaceAllCompat } from "./legacy-webview";

describe("legacy Android WebView compatibility", () => {
  it("replaces every literal match", () => {
    expect(replaceAllCompat("DINE_IN_ORDER", "_", " ")).toBe("DINE IN ORDER");
  });

  it("creates objects from entry pairs", () => {
    expect(fromEntriesCompat([["sale", 1], ["refund", 2]])).toEqual({ sale: 1, refund: 2 });
  });
});
