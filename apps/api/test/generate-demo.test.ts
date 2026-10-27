import { type Lane, manilaDate, manilaHour, nextStatus, type Role } from "@bq/shared";
import { describe, expect, it } from "vitest";
import { generateDemoData } from "../src/demo/generate-demo.js";

const now = new Date("2026-10-28T04:30:00Z"); // 12:30 in Manila
const data = generateDemoData({ seed: 42, code: "7k2f", now });
const today = manilaDate(now);
const ROLE_OF: Record<string, Role> = { kapitan: "KAPITAN", staff1: "STAFF", staff2: "STAFF", resident: "RESIDENT" };

describe("generateDemoData", () => {
  it("is deterministic", () => {
    expect(generateDemoData({ seed: 42, code: "7k2f", now })).toEqual(data);
    expect(generateDemoData({ seed: 43, code: "7k2f", now })).not.toEqual(data);
  });

  it("has the people, counters and document types of spec 7.5", () => {
    expect(data.residents).toHaveLength(41);
    expect(data.residents[0]!.fullName).toBe("Juan Dela Cruz");
    expect(data.residents.every((r) => r.purok >= 1 && r.purok <= 7)).toBe(true);
    expect(data.documentTypes.map((t) => [t.code, t.feeCentavos, t.validityDays])).toEqual([
      ["CLEARANCE", 10000, 180],
      ["RESIDENCY", 7500, 180],
      ["INDIGENCY", 0, 180],
      ["BUSINESS", 50000, 365],
      ["BRGY_ID", 5000, 365],
    ]);
    expect(data.counters.map((c) => [c.name, c.open, c.staff])).toEqual([
      ["Counter 1", true, "staff1"],
      ["Counter 2", true, "staff2"],
      ["Counter 3", false, null],
    ]);
  });

  it("has 30 days of served and missed tickets during hall hours, numbered without gaps", () => {
    const history = data.tickets.filter((t) => t.day !== today);
    const days = new Set(history.map((t) => t.day));
    expect(days.size).toBe(30);
    for (const day of days) {
      const dayTickets = history.filter((t) => t.day === day);
      expect(dayTickets.length).toBeGreaterThanOrEqual(25);
      expect(dayTickets.length).toBeLessThanOrEqual(60);
      for (const lane of ["PRIORITY", "DOCUMENTS", "GENERAL"] as Lane[]) {
        const numbers = dayTickets.filter((t) => t.lane === lane).map((t) => t.number).sort((a, b) => a - b);
        expect(numbers).toEqual(numbers.map((_, i) => i + 1));
      }
    }
    for (const t of history) {
      expect(["SERVED", "MISSED"]).toContain(t.status);
      expect(t.queuedAt < t.calledAt!).toBe(true);
      if (t.status === "SERVED") expect(t.calledAt! < t.servedAt!).toBe(true);
      expect(manilaHour(t.queuedAt)).toBeGreaterThanOrEqual(8);
      expect(manilaHour(t.servedAt ?? t.calledAt!)).toBeLessThanOrEqual(16);
    }
    const priority = history.filter((t) => t.lane === "PRIORITY").length / history.length;
    expect(priority).toBeGreaterThan(0.1);
    expect(priority).toBeLessThan(0.25);
  });

  it("has history requests and today's requests in every status", () => {
    const history = data.requests.filter((r) => manilaDate(r.createdAt) !== today);
    expect(data.requests.length).toBeLessThanOrEqual(160);
    expect(history.length).toBeGreaterThan(30);
    const todays = data.requests.filter((r) => manilaDate(r.createdAt) === today);
    for (const s of ["SUBMITTED", "FOR_APPROVAL", "READY_FOR_PICKUP", "RELEASED", "REJECTED", "CANCELLED"])
      expect(todays.some((r) => r.status === s)).toBe(true);
    const juan = data.requests.filter((r) => r.residentIndex === 0);
    expect(juan.some((r) => r.status === "READY_FOR_PICKUP" && data.documentTypes[r.typeIndex]!.code === "CLEARANCE" && r.purpose === "Employment")).toBe(true);
    expect(juan.some((r) => r.status === "RELEASED")).toBe(true);
  });

  it("has today's queue: some finished, 6 to 10 waiting, one called at Counter 1", () => {
    const todays = data.tickets.filter((t) => t.day === today);
    const finished = todays.filter((t) => t.status === "SERVED" || t.status === "MISSED");
    expect(finished.length).toBeGreaterThanOrEqual(8);
    expect(finished.length).toBeLessThanOrEqual(15);
    const waiting = todays.filter((t) => t.status === "WAITING");
    expect(waiting.length).toBeGreaterThanOrEqual(6);
    expect(waiting.length).toBeLessThanOrEqual(10);
    const called = todays.filter((t) => t.status === "CALLED");
    expect(called).toHaveLength(1);
    expect(called[0]!.counterIndex).toBe(0);
    expect(waiting.every((t) => t.residentIndex !== 0)).toBe(true);
    for (const lane of ["PRIORITY", "DOCUMENTS", "GENERAL"] as Lane[]) {
      const max = Math.max(0, ...todays.filter((t) => t.lane === lane).map((t) => t.number));
      const seq = data.sequences.find((s) => s.day === today && s.lane === lane);
      expect(seq?.lastNumber ?? 0).toBe(max);
    }
  });

  it("gives every request a valid event chain and released documents their codes", () => {
    const codes = new Set<string>();
    for (const r of data.requests) {
      expect(r.events[0]).toMatchObject({ from: null, to: "SUBMITTED" });
      for (const e of r.events.slice(1)) {
        const role = e.actor ? ROLE_OF[e.actor]! : "RESIDENT";
        expect(nextStatus(e.from!, e.action!, role)).toEqual({ ok: true, to: e.to });
      }
      for (let i = 1; i < r.events.length; i++) expect(r.events[i]!.at > r.events[i - 1]!.at).toBe(true);
      expect(r.events.at(-1)!.to).toBe(r.status);
      if (r.status === "RELEASED") {
        expect(r.verificationCode).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
        codes.add(r.verificationCode!);
        const validity = data.documentTypes[r.typeIndex]!.validityDays;
        expect(r.validUntil!.getTime() - r.releasedAt!.getTime()).toBe(validity * 86_400_000);
        if (r.feeCentavos > 0) expect(r.orNumber).toMatch(/^OR-\d{4,10}$/);
      } else expect(r.verificationCode).toBeNull();
    }
    expect(codes.size).toBe(data.requests.filter((r) => r.status === "RELEASED").length);
  });

  it("puts nothing after now", () => {
    const times = [
      ...data.tickets.flatMap((t) => [t.queuedAt, t.calledAt, t.servedAt]),
      ...data.requests.flatMap((r) => r.events.map((e) => e.at)),
    ].filter((d): d is Date => d instanceof Date);
    expect(times.every((d) => d <= now)).toBe(true);
  });
});
