import { describe, expect, it } from "vitest";
import { etaText, formatManilaDate } from "../src/lib/format";

const t = (key: string, values?: Record<string, unknown>) => (key === "next" ? "You're next" : `${values?.ahead} ahead · about ${values?.minutes} min`);

describe("format", () => {
  it("says you're next when nobody is ahead and never less than 1 minute", () => {
    expect(etaText(t, 0, 0)).toBe("You're next");
    expect(etaText(t, 3, 0)).toBe("3 ahead · about 1 min");
    expect(etaText(t, 3, 9)).toBe("3 ahead · about 9 min");
  });

  it("formats dates on the Manila calendar", () => {
    expect(formatManilaDate("2026-10-27T16:30:00Z", "en")).toBe("Oct 28, 2026");
  });
});
