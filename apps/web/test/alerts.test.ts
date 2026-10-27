import type { TicketUpdate } from "@bq/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { alertsFor, createFiredStore } from "../src/lib/realtime/alerts";

const update = (over: Partial<TicketUpdate>): TicketUpdate => ({
  version: 1,
  ticketId: "t1",
  code: "D-012",
  lane: "DOCUMENTS",
  status: "WAITING",
  ahead: 5,
  etaMinutes: 10,
  counterName: null,
  callCount: 0,
  rejoined: false,
  ...over,
});

/** Runs a sequence of updates through the alert rules, remembering what fired like the page does. */
function run(store: ReturnType<typeof createFiredStore>, updates: TicketUpdate[]) {
  return updates.map((u) => {
    const alerts = alertsFor(u, store);
    for (const a of alerts) store.add(a.key);
    return alerts.map((a) => a.kind);
  });
}

describe("ticket alerts (Review Focus 2)", () => {
  beforeEach(() => sessionStorage.clear());

  it("fires the near alert once, even when the position jumps past 3", () => {
    const fired = run(createFiredStore(), [update({ ahead: 5 }), update({ ahead: 4 }), update({ ahead: 2 }), update({ ahead: 1 })]);
    expect(fired).toEqual([[], [], ["near"], []]);
  });

  it("fires the called alert when a ticket goes straight from waiting to called", () => {
    const fired = run(createFiredStore(), [update({ ahead: 5 }), update({ status: "CALLED", ahead: 0, callCount: 1, counterName: "Counter 2" })]);
    expect(fired).toEqual([[], ["called"]]);
  });

  it("fires again for a call again and after a rejoin", () => {
    const fired = run(createFiredStore(), [
      update({ status: "CALLED", callCount: 1 }),
      update({ status: "CALLED", callCount: 2 }),
      update({ ahead: 3 }),
      update({ ahead: 3, rejoined: true }),
    ]);
    expect(fired).toEqual([["called"], ["called"], ["near"], ["near"]]);
  });

  it("does not fire again after a reload", () => {
    run(createFiredStore(), [update({ ahead: 2 })]);
    expect(run(createFiredStore(), [update({ ahead: 2 })])).toEqual([[]]);
  });
});
