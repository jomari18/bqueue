import { describe, expect, it } from "vitest";
import { formatVerificationCode, normalizeVerificationCode } from "../src/index.js";

describe("verification codes", () => {
  it("normalizes what people type", () => {
    expect(normalizeVerificationCode("abcde fghjk")).toBe("ABCDEFGHJK");
    expect(normalizeVerificationCode(" ABCDE-FGHJK ")).toBe("ABCDEFGHJK");
    expect(normalizeVerificationCode("o0il1-23456")).toBe("0011123456");
  });

  it("refuses impossible codes", () => {
    expect(normalizeVerificationCode("ABCDEFGHJ")).toBeNull();
    expect(normalizeVerificationCode("ABCDEFGHJU")).toBeNull();
  });

  it("formats in two groups", () => {
    expect(formatVerificationCode("ABCDEFGHJK")).toBe("ABCDE-FGHJK");
  });
});
