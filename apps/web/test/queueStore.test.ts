import type { QueueCalledEvent, QueueSnapshot } from "@bq/shared";
import { describe, expect, it } from "vitest";
import { applyCalled, applySnapshot, initialQueueStore } from "../src/lib/realtime/queueStore";

const snap = (version: number): QueueSnapshot => ({
  version,
  day: "2026-10-28",
  barangay: { name: "Barangay Masagana", city: "Lungsod ng Kalayaan" },
  counters: [],
  waiting: { PRIORITY: 0, DOCUMENTS: 0, GENERAL: 0 },
  lastCalls: [],
});
const called = (version: number): QueueCalledEvent => ({ version, code: "D-012", lane: "DOCUMENTS", counterName: "Counter 2", callCount: 1 });

describe("queue store", () => {
  it("never goes back to an older snapshot", () => {
    const s = applySnapshot(applySnapshot(initialQueueStore, snap(5)), snap(4));
    expect(s.version).toBe(5);
  });

  it("applies a newer snapshot across a gap, since it is complete", () => {
    const s = applySnapshot(applySnapshot(initialQueueStore, snap(5)), snap(7));
    expect(s.version).toBe(7);
    expect(s.needsResync).toBe(false);
  });

  it("asks for a resync when a call skips a version", () => {
    const s = applyCalled(applySnapshot(initialQueueStore, snap(5)), called(7));
    expect(s.needsResync).toBe(true);
    expect(s.lastCall?.code).toBe("D-012");
    expect(applyCalled(applySnapshot(initialQueueStore, snap(5)), called(6)).needsResync).toBe(false);
  });
});
