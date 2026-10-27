import { describe, expect, it } from "vitest";
import { allowedActions, nextStatus, REQUEST_ACTIONS, REQUEST_STATUSES, REQUEST_TRANSITIONS, ROLES } from "../src/index.js";

describe("request transitions", () => {
  it("follows spec 6.1", () => {
    expect(nextStatus("SUBMITTED", "forward", "STAFF")).toEqual({ ok: true, to: "FOR_APPROVAL" });
    expect(nextStatus("FOR_APPROVAL", "reject", "STAFF")).toEqual({ ok: false, reason: "forbidden" });
    expect(nextStatus("FOR_APPROVAL", "reject", "KAPITAN")).toEqual({ ok: true, to: "REJECTED" });
    expect(nextStatus("READY_FOR_PICKUP", "approve", "KAPITAN")).toEqual({ ok: false, reason: "invalid_transition" });
    expect(nextStatus("SUBMITTED", "approve", "STAFF")).toEqual({ ok: false, reason: "forbidden" });
    expect(nextStatus("FOR_APPROVAL", "cancel", "RESIDENT")).toEqual({ ok: false, reason: "invalid_transition" });
    expect(nextStatus("RELEASED", "revoke", "KAPITAN")).toEqual({ ok: true, to: "RELEASED" });
    expect(allowedActions("SUBMITTED", "STAFF")).toEqual(["forward", "reject"]);
  });

  it("allows a move exactly when a row allows it", () => {
    for (const from of REQUEST_STATUSES)
      for (const action of REQUEST_ACTIONS)
        for (const role of ROLES) {
          const row = REQUEST_TRANSITIONS.find((r) => r.from === from && r.action === action && r.roles.includes(role));
          expect(nextStatus(from, action, role).ok).toBe(Boolean(row));
        }
  });
});
