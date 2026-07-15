import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "./security";

describe("local credential protection", () => {
  it("hashes with a unique salt and verifies only the correct secret", async () => {
    const first = await hashSecret("2468");
    const second = await hashSecret("2468");
    expect(first).not.toBe(second);
    await expect(verifySecret("2468", first)).resolves.toBe(true);
    await expect(verifySecret("1357", first)).resolves.toBe(false);
  });

  it("rejects short secrets and malformed or weak encoded values", async () => {
    await expect(hashSecret("123")).rejects.toThrow(/four characters/i);
    await expect(verifySecret("2468", "broken")).resolves.toBe(false);
    await expect(verifySecret("2468", "pbkdf2$10$AAAA$AAAA")).resolves.toBe(false);
  });
});
