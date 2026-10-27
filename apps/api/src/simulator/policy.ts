import type { Lane } from "@bq/shared";

// Pure rules of the simulator (spec 8.4, 8.5), separate from its timers so they can be tested directly.

const MIN = 60_000;
const IDLE_AFTER_LAST_SOCKET_MS = 2 * MIN;
const PAUSE_AFTER_HUMAN_MS = 20 * MIN;

export type RunState = {
  enabled: boolean;
  simulatorOn: boolean;
  sockets: number;
  lastSocketLeftAt: Date | null;
  lastHumanActionAt: Date | null;
  capsReached: boolean;
  now: Date;
};

/**
 * Runs only while switched on, under the caps, while someone watches (or left under 2 minutes ago), and until
 * 20 minutes after the last action by a person, so a forgotten TV tab lets the free server sleep.
 */
export function shouldRun(s: RunState): boolean {
  if (!s.enabled || !s.simulatorOn || s.capsReached) return false;
  const now = s.now.getTime();
  if (s.sockets === 0 && (!s.lastSocketLeftAt || now - s.lastSocketLeftAt.getTime() >= IDLE_AFTER_LAST_SOCKET_MS)) return false;
  if (!s.lastHumanActionAt || now - s.lastHumanActionAt.getTime() >= PAUSE_AFTER_HUMAN_MS) return false;
  return true;
}

/** 55% a request; otherwise a ticket in Documents (50%), General (30%) or Priority (20%). */
export function pickResidentAction(rng: () => number): { kind: "request" } | { kind: "ticket"; lane: Lane } {
  if (rng() < 0.55) return { kind: "request" };
  const r = rng();
  return { kind: "ticket", lane: r < 0.5 ? "DOCUMENTS" : r < 0.8 ? "GENERAL" : "PRIORITY" };
}

const uniform = (rng: () => number, min: number, max: number) => Math.round(min + rng() * (max - min));

export const residentDelayMs = (rng: () => number) => uniform(rng, 15_000, 40_000);
export const staffDelayMs = (rng: () => number) => uniform(rng, 40_000, 50_000);
export const staffOutcome = (rng: () => number): "SERVED" | "MISSED" => (rng() < 0.9 ? "SERVED" : "MISSED");
