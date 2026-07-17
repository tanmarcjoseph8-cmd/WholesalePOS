import { describe, expect, it } from "vitest";
import { canAccessFactoryReset, canContinueWithoutBackup, isFactoryResetPhrase, nextFactoryResetStep } from "./factory-reset-rules";

describe("factory reset UI rules", () => {
  it("shows Factory Reset to the Owner", () => expect(canAccessFactoryReset({ role: "OWNER" })).toBe(true));
  it("hides Factory Reset from managers", () => expect(canAccessFactoryReset({ role: "MANAGER" })).toBe(false));
  it("hides Factory Reset from cashiers", () => expect(canAccessFactoryReset({ role: "CASHIER" })).toBe(false));
  it("initial Continue advances only to reauthentication", () => expect(nextFactoryResetStep("warning")).toBe("reauthenticate"));
  it("requires the exact case-sensitive phrase", () => {
    expect(isFactoryResetPhrase("factory reset")).toBe(false);
    expect(isFactoryResetPhrase("FACTORY RESET ")).toBe(false);
    expect(isFactoryResetPhrase("FACTORY RESET")).toBe(true);
  });
  it("requires acknowledgment before disabling backup", () => {
    expect(canContinueWithoutBackup(true, false)).toBe(true);
    expect(canContinueWithoutBackup(false, false)).toBe(false);
    expect(canContinueWithoutBackup(false, true)).toBe(true);
  });
});
