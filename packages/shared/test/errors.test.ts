import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES, ERROR_STATUS, type ErrorCode, pickLanguage } from "../src/index.js";

describe("error codes", () => {
  it("lists the 17 codes of spec 9.9 with their statuses", () => {
    expect(Object.keys(ERROR_STATUS)).toHaveLength(17);
    expect([ERROR_STATUS.counter_busy, ERROR_STATUS.account_locked, ERROR_STATUS.demo_full]).toEqual([409, 423, 503]);
  });

  it("has an English and a Filipino message for every code", () => {
    for (const code of Object.keys(ERROR_STATUS) as ErrorCode[]) {
      expect(ERROR_MESSAGES[code].en.length).toBeGreaterThan(0);
      expect(ERROR_MESSAGES[code].fil.length).toBeGreaterThan(0);
    }
  });

  it("picks the language from Accept-Language", () => {
    expect(pickLanguage("fil-PH,fil;q=0.9,en;q=0.8")).toBe("fil");
    expect(pickLanguage("tl")).toBe("fil");
    expect(pickLanguage("en-US,fil;q=0.5")).toBe("en");
    expect(pickLanguage(undefined)).toBe("en");
  });
});
