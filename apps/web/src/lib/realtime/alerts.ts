import type { TicketUpdate } from "@bq/shared";

// Resident alerts (spec 10): "near" when 3 or fewer are ahead, "called" on each call. Each fires once per ticket
// state; keys are remembered in sessionStorage so a reload does not repeat them.

export type Alert = { kind: "near" | "called"; key: string; ticket: TicketUpdate };

export function alertsFor(next: TicketUpdate, fired: { has(key: string): boolean }): Alert[] {
  const round = next.rejoined ? 1 : 0;
  if (next.status === "CALLED") {
    const key = `called:${next.ticketId}:${round}:${next.callCount}`;
    return fired.has(key) ? [] : [{ kind: "called", key, ticket: next }];
  }
  if (next.status === "WAITING" && next.ahead <= 3) {
    const key = `near:${next.ticketId}:${round}`;
    return fired.has(key) ? [] : [{ kind: "near", key, ticket: next }];
  }
  return [];
}

const STORAGE_KEY = "bq-alerts";

/** Fired alert keys, kept in sessionStorage when it works and in memory otherwise. */
export function createFiredStore(): { has(key: string): boolean; add(key: string): void } {
  let keys = new Set<string>();
  try {
    keys = new Set(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as string[]);
  } catch {
    // Storage blocked: remember in memory for this page.
  }
  return {
    has: (key) => keys.has(key),
    add(key) {
      keys.add(key);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
      } catch {
        // Keep it in memory only.
      }
    },
  };
}
