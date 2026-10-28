import { describe, expect, it } from "vitest";
import { addDays, announcement, englishDigits, etaMinutes, filipinoDigits, manilaDate, manilaDayStart, manilaHour, parseTicketCode, ticketCode } from "../src/index.js";

describe("ticket codes", () => {
  it("pads to three digits and keeps longer numbers", () => {
    expect(ticketCode("DOCUMENTS", 12)).toBe("D-012");
    expect(ticketCode("PRIORITY", 1)).toBe("P-001");
    expect(ticketCode("GENERAL", 105)).toBe("G-105");
    expect(ticketCode("DOCUMENTS", 1000)).toBe("D-1000");
    expect(() => ticketCode("GENERAL", 0)).toThrow(RangeError);
  });

  it("parses codes back", () => {
    expect(parseTicketCode("D-1000")).toEqual({ lane: "DOCUMENTS", number: 1000 });
    for (const bad of ["X-001", "D-01", "D012", ""]) expect(parseTicketCode(bad)).toBeNull();
  });
});

describe("Manila time", () => {
  it("uses the Manila calendar day and hour", () => {
    expect(manilaDate(new Date("2026-10-27T16:30:00Z"))).toBe("2026-10-28");
    expect(manilaDayStart("2026-10-28").toISOString()).toBe("2026-10-27T16:00:00.000Z");
    expect(manilaHour(new Date("2026-10-28T01:15:00Z"))).toBe(9);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("etaMinutes", () => {
  it("rounds up and never divides by zero counters", () => {
    expect(etaMinutes(3, 240, 1)).toBe(12);
    expect(etaMinutes(3, 180, 2)).toBe(5);
    expect(etaMinutes(0, 240, 2)).toBe(0);
    expect(etaMinutes(5, 240, 0)).toBe(20);
  });
});

describe("announcements", () => {
  it("reads digits one by one", () => {
    expect(filipinoDigits("D-012")).toBe("D, sero, isa, dalawa");
    expect(filipinoDigits("P-789")).toBe("P, pito, walo, siyam");
    expect(englishDigits("G-1000")).toBe("G, one, zero, zero, zero");
  });

  it("builds the TV sentence in both languages", () => {
    expect(announcement("D-012", "Counter 2", "en")).toBe("Now serving D, zero, one, two, at Counter 2.");
    expect(announcement("D-012", "Counter 2", "fil")).toBe("Numero D, sero, isa, dalawa, sa Counter 2.");
  });
});
