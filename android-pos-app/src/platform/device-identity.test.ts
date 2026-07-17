import { describe, expect, it } from "vitest";
import { formatLicenseDeviceId } from "./device-identity";

describe("license Device ID", () => {
  it("is stable, uppercase, and suitable for manual entry", async () => {
    const first = await formatLicenseDeviceId("android-scoped-id"); const second = await formatLicenseDeviceId("android-scoped-id");
    expect(first).toBe(second); expect(first).toMatch(/^WPOS(?:-[A-F0-9]{4}){6}$/);
  });
});
