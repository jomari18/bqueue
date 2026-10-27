import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/demo/random.js";
import { pickResidentAction, residentDelayMs, shouldRun, staffDelayMs, staffOutcome } from "../src/simulator/policy.js";

const now = new Date("2026-10-28T02:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const base = {
  enabled: true,
  simulatorOn: true,
  sockets: 1,
  lastSocketLeftAt: null,
  lastHumanActionAt: ago(1),
  capsReached: false,
  now,
};

describe("simulator policy", () => {
  it.each([
    ["switched off", { simulatorOn: false }, false],
    ["disabled by config", { enabled: false }, false],
    ["last socket left 1 min ago", { sockets: 0, lastSocketLeftAt: ago(1) }, true],
    ["last socket left 2 min ago", { sockets: 0, lastSocketLeftAt: ago(2) }, false],
    ["nobody ever connected", { sockets: 0, lastSocketLeftAt: null }, false],
    ["a person acted 19 min ago", { lastHumanActionAt: ago(19) }, true],
    ["a person acted 20 min ago", { lastHumanActionAt: ago(20) }, false],
    ["caps reached", { capsReached: true }, false],
  ])("%s → %s", (_label, change, expected) => {
    expect(shouldRun({ ...base, ...change })).toBe(expected);
  });

  it("mixes requests and lanes as spec 8.5 says", () => {
    const rng = mulberry32(1);
    const counts = { request: 0, PRIORITY: 0, DOCUMENTS: 0, GENERAL: 0 };
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const a = pickResidentAction(rng);
      if (a.kind === "request") counts.request++;
      else counts[a.lane]++;
    }
    const tickets = n - counts.request;
    expect(counts.request / n).toBeCloseTo(0.55, 1);
    expect(Math.abs(counts.request / n - 0.55)).toBeLessThan(0.02);
    expect(Math.abs(counts.DOCUMENTS / tickets - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(counts.GENERAL / tickets - 0.3)).toBeLessThan(0.02);
    expect(Math.abs(counts.PRIORITY / tickets - 0.2)).toBeLessThan(0.02);
  });

  it("keeps delays and outcomes in range", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const r = residentDelayMs(rng);
      const s = staffDelayMs(rng);
      expect(r).toBeGreaterThanOrEqual(15_000);
      expect(r).toBeLessThanOrEqual(40_000);
      expect(s).toBeGreaterThanOrEqual(40_000);
      expect(s).toBeLessThanOrEqual(50_000);
    }
    const outcomes = Array.from({ length: 10_000 }, () => staffOutcome(rng));
    expect(Math.abs(outcomes.filter((o) => o === "SERVED").length / 10_000 - 0.9)).toBeLessThan(0.02);
  });
});
