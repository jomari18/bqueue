import { randomUUID } from "node:crypto";

export type SubjectKind = "anonymous" | "resident" | "staff" | "kapitan" | "display" | "kiosk";

export type Ids = {
  documentTypeId: string;
  submitted: string;
  toForward: string;
  toReject: string;
  forApproval: string;
  ready: string;
  released: string;
  counter: string;
  otherCounter: string;
  calledTicket: string;
  missedTicket: string;
  staffId: string;
};

export type Route = {
  method: "GET" | "POST" | "PATCH";
  path: (ids: Ids) => string;
  body?: (ids: Ids) => unknown;
  allow: SubjectKind[];
};

const SIGNED_IN: SubjectKind[] = ["resident", "staff", "kapitan"];
const WORKERS: SubjectKind[] = ["staff", "kapitan"];

/**
 * Every protected route with who may call it (spec 7.4 plus the reads this plan adds). Order matters: routes that
 * change shared state (assigning the counter, rotating keys) come last.
 */
export const ROUTES: Route[] = [
  { method: "GET", path: () => "/api/me", allow: SIGNED_IN },
  { method: "POST", path: () => "/api/demo/join-code", allow: SIGNED_IN },
  { method: "GET", path: () => "/api/document-types", allow: SIGNED_IN },
  {
    method: "POST",
    path: () => "/api/requests",
    body: (ids) => ({ id: randomUUID(), documentTypeId: ids.documentTypeId, purpose: "Employment" }),
    allow: ["resident"],
  },
  { method: "GET", path: () => "/api/requests", allow: SIGNED_IN },
  { method: "GET", path: (ids) => `/api/requests/${ids.submitted}`, allow: SIGNED_IN },
  { method: "GET", path: (ids) => `/api/requests/${ids.released}/document`, allow: SIGNED_IN },
  { method: "POST", path: (ids) => `/api/requests/${ids.toForward}/forward`, allow: WORKERS },
  { method: "POST", path: (ids) => `/api/requests/${ids.toReject}/reject`, body: () => ({ reason: "Incomplete details" }), allow: WORKERS },
  { method: "POST", path: (ids) => `/api/requests/${ids.forApproval}/approve`, allow: ["kapitan"] },
  {
    method: "POST",
    path: (ids) => `/api/requests/${ids.ready}/release`,
    body: () => ({ idChecked: true, orNumber: "OR-1234" }),
    allow: WORKERS,
  },
  { method: "POST", path: (ids) => `/api/requests/${ids.released}/revoke`, body: () => ({ reason: "Issued by mistake" }), allow: ["kapitan"] },
  { method: "POST", path: (ids) => `/api/requests/${ids.submitted}/cancel`, allow: ["resident"] },
  { method: "POST", path: () => "/api/queue/tickets", body: () => ({ id: randomUUID(), lane: "GENERAL" }), allow: ["resident"] },
  { method: "GET", path: () => "/api/queue/state", allow: [...SIGNED_IN, "display", "kiosk"] },
  { method: "GET", path: () => "/api/queue/tickets/mine", allow: ["resident"] },
  { method: "GET", path: () => "/api/queue/tickets?status=MISSED", allow: WORKERS },
  { method: "POST", path: () => "/api/kiosk/tickets", body: () => ({ id: randomUUID(), lane: "DOCUMENTS" }), allow: ["kiosk"] },
  { method: "GET", path: () => "/api/counters", allow: WORKERS },
  { method: "POST", path: (ids) => `/api/counters/${ids.counter}/call-next`, allow: WORKERS },
  { method: "POST", path: (ids) => `/api/queue/tickets/${ids.calledTicket}/call-again`, allow: WORKERS },
  { method: "POST", path: (ids) => `/api/queue/tickets/${ids.calledTicket}/missed`, allow: WORKERS },
  { method: "POST", path: (ids) => `/api/queue/tickets/${ids.calledTicket}/served`, allow: WORKERS },
  { method: "POST", path: (ids) => `/api/queue/tickets/${ids.missedTicket}/rejoin`, allow: SIGNED_IN },
  { method: "POST", path: (ids) => `/api/counters/${ids.counter}/open`, allow: WORKERS },
  { method: "POST", path: (ids) => `/api/counters/${ids.counter}/close`, allow: WORKERS },
  { method: "GET", path: () => "/api/reports/summary?range=7d", allow: ["kapitan"] },
  { method: "GET", path: () => "/api/settings/document-types", allow: ["kapitan"] },
  { method: "PATCH", path: (ids) => `/api/settings/document-types/${ids.documentTypeId}`, body: () => ({ active: true }), allow: ["kapitan"] },
  { method: "GET", path: () => "/api/settings/counters", allow: ["kapitan"] },
  { method: "POST", path: () => "/api/settings/counters", body: () => ({ name: "Counter 9", lanes: ["GENERAL"] }), allow: ["kapitan"] },
  { method: "PATCH", path: (ids) => `/api/settings/counters/${ids.otherCounter}`, body: () => ({ name: "Counter 3" }), allow: ["kapitan"] },
  { method: "GET", path: () => "/api/settings/staff", allow: ["kapitan"] },
  { method: "POST", path: () => "/api/settings/staff", body: () => ({ displayName: "Ate Joy", pin: "739204" }), allow: ["kapitan"] },
  { method: "PATCH", path: (ids) => `/api/settings/staff/${ids.staffId}`, body: () => ({ pin: "591846" }), allow: ["kapitan"] },
  { method: "PATCH", path: () => "/api/settings/simulator", body: () => ({ on: true }), allow: ["kapitan"] },
  { method: "POST", path: (ids) => `/api/counters/${ids.counter}/assign`, body: () => ({}), allow: WORKERS },
  { method: "POST", path: () => "/api/settings/keys/display/rotate", allow: ["kapitan"] },
  { method: "POST", path: () => "/api/settings/keys/kiosk/rotate", allow: ["kapitan"] },
];
