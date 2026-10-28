import type { RequestAction, RequestStatus, Role } from "./enums.js";

// Spec 6.1: who may move a request from which status. The API enforces it; the web app uses it to show buttons.
export const REQUEST_TRANSITIONS: readonly {
  from: RequestStatus;
  action: RequestAction;
  to: RequestStatus;
  roles: readonly Role[];
}[] = [
  { from: "SUBMITTED", action: "cancel", to: "CANCELLED", roles: ["RESIDENT"] },
  { from: "SUBMITTED", action: "forward", to: "FOR_APPROVAL", roles: ["STAFF", "KAPITAN"] },
  { from: "SUBMITTED", action: "reject", to: "REJECTED", roles: ["STAFF", "KAPITAN"] },
  { from: "FOR_APPROVAL", action: "reject", to: "REJECTED", roles: ["KAPITAN"] },
  { from: "FOR_APPROVAL", action: "approve", to: "READY_FOR_PICKUP", roles: ["KAPITAN"] },
  { from: "READY_FOR_PICKUP", action: "release", to: "RELEASED", roles: ["STAFF", "KAPITAN"] },
  { from: "RELEASED", action: "revoke", to: "RELEASED", roles: ["KAPITAN"] },
];

export type TransitionResult = { ok: true; to: RequestStatus } | { ok: false; reason: "forbidden" | "invalid_transition" };

/**
 * A row for this status and action decides by role. Without one, the move is an invalid transition when the role
 * may do this action from another status, and forbidden when it never may.
 */
export function nextStatus(from: RequestStatus, action: RequestAction, role: Role): TransitionResult {
  const row = REQUEST_TRANSITIONS.find((r) => r.from === from && r.action === action);
  if (row) return row.roles.includes(role) ? { ok: true, to: row.to } : { ok: false, reason: "forbidden" };
  const elsewhere = REQUEST_TRANSITIONS.some((r) => r.action === action && r.roles.includes(role));
  return { ok: false, reason: elsewhere ? "invalid_transition" : "forbidden" };
}

export function allowedActions(status: RequestStatus, role: Role): RequestAction[] {
  return REQUEST_TRANSITIONS.filter((r) => r.from === status && r.roles.includes(role)).map((r) => r.action);
}
