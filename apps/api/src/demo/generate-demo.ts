import {
  addDays,
  CROCKFORD,
  type CivilStatus,
  type DocumentCode,
  type Lane,
  manilaDate,
  manilaDayStart,
  type RequestAction,
  type RequestStatus,
  type Sex,
  type TicketSource,
  type TicketStatus,
} from "@bq/shared";
import { BUSINESS_NAMES, DOCUMENT_TYPES, FIRST_NAMES, PURPOSES, SURNAMES } from "./seed-data.js";
import { chance, int, mulberry32, pick, type Rng, shuffle } from "./random.js";

// Builds a demo barangay's data as plain values (spec 7.5). Records point at each other by array index; the
// inserter turns them into rows with UUIDs. Pure and deterministic, so tests can check every invariant.

export type Actor = "kapitan" | "staff1" | "staff2" | "resident";

export type SeedResident = {
  fullName: string;
  birthDate: string;
  sex: Sex;
  civilStatus: CivilStatus;
  purok: number;
  addressLine: string;
  residentSince: number;
};
export type SeedDocumentType = (typeof DOCUMENT_TYPES)[number];
export type SeedCounter = { name: string; open: boolean; staff: "staff1" | "staff2" | null; sortOrder: number };
export type SeedEvent = { from: RequestStatus | null; to: RequestStatus; action: RequestAction | null; actor: Actor | null; at: Date; note: string | null };
export type SeedRequest = {
  residentIndex: number;
  typeIndex: number;
  status: RequestStatus;
  purpose: string;
  businessName: string | null;
  feeCentavos: number;
  createdAt: Date;
  approvedBy: Actor | null;
  approvedAt: Date | null;
  releasedBy: Actor | null;
  releasedAt: Date | null;
  orNumber: string | null;
  verificationCode: string | null;
  validUntil: Date | null;
  rejectReason: string | null;
  events: SeedEvent[];
};
export type SeedTicket = {
  day: string;
  lane: Lane;
  number: number;
  status: TicketStatus;
  source: TicketSource;
  residentIndex: number | null;
  requestIndex: number | null;
  queuedAt: Date;
  calledAt: Date | null;
  servedAt: Date | null;
  counterIndex: number | null;
  callCount: number;
};
export type DemoData = {
  residents: SeedResident[];
  documentTypes: SeedDocumentType[];
  counters: SeedCounter[];
  requests: SeedRequest[];
  tickets: SeedTicket[];
  sequences: { day: string; lane: Lane; lastNumber: number }[];
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const HISTORY_DAYS = 30;

function pickLane(rng: Rng): Lane {
  const r = rng();
  return r < 0.15 ? "PRIORITY" : r < 0.6 ? "DOCUMENTS" : "GENERAL";
}

function residents(rng: Rng): SeedResident[] {
  const juan: SeedResident = {
    fullName: "Juan Dela Cruz",
    birthDate: "1990-05-14",
    sex: "MALE",
    civilStatus: "MARRIED",
    purok: 3,
    addressLine: "Blk 4 Lot 12, Purok 3",
    residentSince: 2010,
  };
  const used = new Set([juan.fullName]);
  const others: SeedResident[] = [];
  while (others.length < 40) {
    const sex: Sex = chance(rng, 0.5) ? "MALE" : "FEMALE";
    const fullName = `${pick(rng, FIRST_NAMES[sex])} ${pick(rng, SURNAMES)}`;
    if (used.has(fullName)) continue;
    used.add(fullName);
    const purok = int(rng, 1, 7);
    // About a quarter are seniors, so the Priority lane makes sense.
    const year = chance(rng, 0.25) ? int(rng, 1940, 1965) : int(rng, 1966, 2007);
    others.push({
      fullName,
      birthDate: `${year}-${String(int(rng, 1, 12)).padStart(2, "0")}-${String(int(rng, 1, 28)).padStart(2, "0")}`,
      sex,
      civilStatus: pick(rng, ["SINGLE", "MARRIED", "MARRIED", "WIDOWED", "SEPARATED"] as const),
      purok,
      addressLine: `Blk ${int(rng, 1, 20)} Lot ${int(rng, 1, 40)}, Purok ${purok}`,
      residentSince: int(rng, Math.max(year, 1975), 2024),
    });
  }
  return [juan, ...others];
}

function code(rng: Rng, used: Set<string>): string {
  for (;;) {
    let c = "";
    for (let i = 0; i < 10; i++) c += CROCKFORD[Math.floor(rng() * 32)];
    if (!used.has(c)) {
      used.add(c);
      return c;
    }
  }
}

type RequestPlan = { residentIndex: number; typeIndex: number; status: RequestStatus; purpose?: string; createdAt: Date; step: number };

/** Builds a request and its event chain; each step happens `step` ms after the previous one. */
function buildRequest(rng: Rng, p: RequestPlan, codes: Set<string>, orCounter: { n: number }): SeedRequest {
  const type = DOCUMENT_TYPES[p.typeIndex]!;
  const residentActor: Actor | null = p.residentIndex === 0 ? "resident" : null;
  const staff: Actor = chance(rng, 0.5) ? "staff1" : "staff2";
  let at = p.createdAt;
  const events: SeedEvent[] = [{ from: null, to: "SUBMITTED", action: null, actor: residentActor, at, note: null }];
  const move = (to: RequestStatus, action: RequestAction, actor: Actor | null, note: string | null = null) => {
    at = new Date(at.getTime() + p.step);
    events.push({ from: events.at(-1)!.to, to, action, actor, at, note });
  };
  const r: SeedRequest = {
    residentIndex: p.residentIndex,
    typeIndex: p.typeIndex,
    status: p.status,
    purpose: p.purpose ?? pick(rng, PURPOSES),
    businessName: type.needsBusinessName ? `${pick(rng, BUSINESS_NAMES)} ni ${pick(rng, SURNAMES)}` : null,
    feeCentavos: type.feeCentavos,
    createdAt: p.createdAt,
    approvedBy: null,
    approvedAt: null,
    releasedBy: null,
    releasedAt: null,
    orNumber: null,
    verificationCode: null,
    validUntil: null,
    rejectReason: null,
    events,
  };
  switch (p.status) {
    case "SUBMITTED":
      break;
    case "CANCELLED":
      move("CANCELLED", "cancel", residentActor);
      break;
    case "REJECTED":
      r.rejectReason = "Incomplete details. Please submit again with your full address.";
      if (chance(rng, 0.5)) move("REJECTED", "reject", staff, r.rejectReason);
      else {
        move("FOR_APPROVAL", "forward", staff);
        move("REJECTED", "reject", "kapitan", r.rejectReason);
      }
      break;
    default:
      move("FOR_APPROVAL", "forward", staff);
      if (p.status === "FOR_APPROVAL") break;
      move("READY_FOR_PICKUP", "approve", "kapitan");
      r.approvedBy = "kapitan";
      r.approvedAt = at;
      if (p.status === "READY_FOR_PICKUP") break;
      move("RELEASED", "release", staff);
      r.releasedBy = staff;
      r.releasedAt = at;
      r.verificationCode = code(rng, codes);
      r.validUntil = new Date(at.getTime() + type.validityDays * DAY);
      if (type.feeCentavos > 0) r.orNumber = `OR-${2026000 + ++orCounter.n}`;
  }
  return r;
}

/** Numbers tickets per lane in the order they were queued, and returns each lane's last number. */
function numberTickets(tickets: SeedTicket[]): Record<Lane, number> {
  const last: Record<Lane, number> = { PRIORITY: 0, DOCUMENTS: 0, GENERAL: 0 };
  tickets.sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime());
  for (const t of tickets) t.number = ++last[t.lane];
  return last;
}

export function generateDemoData(opts: { seed: number; code: string; now: Date }): DemoData {
  const rng = mulberry32(opts.seed);
  const { now } = opts;
  const today = manilaDate(now);
  const people = residents(rng);
  const codes = new Set<string>();
  const orCounter = { n: 0 };
  const requests: SeedRequest[] = [];
  const tickets: SeedTicket[] = [];
  const sequences: DemoData["sequences"] = [];
  const someone = () => int(rng, 1, people.length - 1);

  // History: the 30 Manila days before today, during hall hours (08:00–17:00).
  for (let d = HISTORY_DAYS; d >= 1; d--) {
    const day = addDays(today, -d);
    const opening = manilaDayStart(day).getTime() + 8 * HOUR;
    for (let i = int(rng, 2, 6); i > 0; i--) {
      const r = rng();
      const status: RequestStatus = r < 0.7 ? "RELEASED" : r < 0.85 ? "REJECTED" : "CANCELLED";
      const createdAt = new Date(opening + int(rng, 0, 3 * 60) * MIN);
      requests.push(buildRequest(rng, { residentIndex: someone(), typeIndex: int(rng, 0, 4), status, createdAt, step: 2 * HOUR }, codes, orCounter));
    }
    const dayTickets: SeedTicket[] = [];
    for (let i = int(rng, 25, 60); i > 0; i--) {
      const queuedAt = new Date(opening + int(rng, 0, 7.5 * 60) * MIN);
      const calledAt = new Date(queuedAt.getTime() + int(rng, 1, 60) * MIN);
      const missed = chance(rng, 0.1);
      const kiosk = chance(rng, 0.2);
      dayTickets.push({
        day,
        lane: pickLane(rng),
        number: 0,
        status: missed ? "MISSED" : "SERVED",
        source: kiosk ? "KIOSK" : "PHONE",
        residentIndex: kiosk ? null : someone(),
        requestIndex: null,
        queuedAt,
        calledAt,
        servedAt: missed ? null : new Date(calledAt.getTime() + int(rng, 2, 6) * MIN),
        counterIndex: int(rng, 0, 1),
        callCount: missed ? 3 : 1,
      });
    }
    numberTickets(dayTickets);
    tickets.push(...dayTickets);
  }

  // Today: activity over the last three hours, whatever the hour, so a demo opened early still has a queue.
  const start = now.getTime() - 3 * HOUR;
  const todayPlans: { status: RequestStatus; residentIndex: number; typeIndex: number; purpose?: string }[] = [
    { status: "SUBMITTED", residentIndex: someone(), typeIndex: 0 },
    { status: "SUBMITTED", residentIndex: someone(), typeIndex: 2 },
    { status: "FOR_APPROVAL", residentIndex: someone(), typeIndex: 1 },
    { status: "FOR_APPROVAL", residentIndex: someone(), typeIndex: 3 },
    { status: "READY_FOR_PICKUP", residentIndex: 0, typeIndex: 0, purpose: "Employment" },
    { status: "READY_FOR_PICKUP", residentIndex: someone(), typeIndex: 4 },
    { status: "RELEASED", residentIndex: 0, typeIndex: 1 },
    { status: "REJECTED", residentIndex: someone(), typeIndex: 0 },
    { status: "CANCELLED", residentIndex: someone(), typeIndex: 2 },
  ];
  for (const plan of todayPlans) {
    const createdAt = new Date(start + int(rng, 0, 60) * MIN);
    requests.push(buildRequest(rng, { ...plan, createdAt, step: 10 * MIN }, codes, orCounter));
  }

  const todayTickets: SeedTicket[] = [];
  const queueResidents = shuffle(rng, Array.from({ length: people.length - 1 }, (_, i) => i + 1));
  const finishedCount = int(rng, 8, 15);
  for (let i = 0; i < finishedCount; i++) {
    const queuedAt = new Date(start + int(rng, 0, 90) * MIN);
    const calledAt = new Date(queuedAt.getTime() + int(rng, 1, 15) * MIN);
    const missed = chance(rng, 0.1);
    todayTickets.push({
      day: today,
      lane: pickLane(rng),
      number: 0,
      status: missed ? "MISSED" : "SERVED",
      source: "PHONE",
      residentIndex: queueResidents[i]!,
      requestIndex: null,
      queuedAt,
      calledAt,
      servedAt: missed ? null : new Date(calledAt.getTime() + int(rng, 2, 5) * MIN),
      counterIndex: int(rng, 0, 1),
      callCount: missed ? 3 : 1,
    });
  }
  // Ate Liza at Counter 1 is serving someone right now.
  const calledQueuedAt = new Date(start + 100 * MIN);
  todayTickets.push({
    day: today,
    lane: "GENERAL",
    number: 0,
    status: "CALLED",
    source: "PHONE",
    residentIndex: queueResidents[finishedCount]!,
    requestIndex: null,
    queuedAt: calledQueuedAt,
    calledAt: new Date(now.getTime() - 2 * MIN),
    servedAt: null,
    counterIndex: 0,
    callCount: 1,
  });
  const waitingCount = int(rng, 6, 10);
  for (let i = 0; i < waitingCount; i++) {
    todayTickets.push({
      day: today,
      lane: pickLane(rng),
      number: 0,
      status: "WAITING",
      source: "PHONE",
      residentIndex: queueResidents[finishedCount + 1 + i]!,
      requestIndex: null,
      queuedAt: new Date(start + (110 + i * 6) * MIN),
      calledAt: null,
      servedAt: null,
      counterIndex: null,
      callCount: 0,
    });
  }
  const last = numberTickets(todayTickets);
  tickets.push(...todayTickets);
  for (const lane of ["PRIORITY", "DOCUMENTS", "GENERAL"] as Lane[]) {
    if (last[lane] > 0) sequences.push({ day: today, lane, lastNumber: last[lane] });
  }

  const counters: SeedCounter[] = [
    { name: "Counter 1", open: true, staff: "staff1", sortOrder: 1 },
    { name: "Counter 2", open: true, staff: "staff2", sortOrder: 2 },
    { name: "Counter 3", open: false, staff: null, sortOrder: 3 },
  ];
  return { residents: people, documentTypes: DOCUMENT_TYPES, counters, requests, tickets, sequences };
}

export type { DocumentCode };
