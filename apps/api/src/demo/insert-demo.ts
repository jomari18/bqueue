import { randomUUID } from "node:crypto";
import { ticketCode } from "@bq/shared";
import type { Tx } from "../prisma/prisma.service.js";
import type { Actor, DemoData } from "./generate-demo.js";

export type DemoUsers = { kapitan: string; staff1: string; staff2: string; resident: string };

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Writes a generated demo barangay with one `INSERT … SELECT FROM unnest(…)` per table, so creation stays fast on
 * Render's free CPU (a lesson from ZariZari). UUIDs are made here so rows can point at each other.
 */
export async function insertDemoData(tx: Tx, barangayId: string, users: DemoUsers, data: DemoData): Promise<void> {
  const actorId = (a: Actor | null) => (a ? users[a] : null);

  const residentIds = data.residents.map(() => randomUUID());
  const r = data.residents;
  await tx.$executeRaw`
    INSERT INTO "Resident" (id, "barangayId", "userId", "fullName", "birthDate", sex, "civilStatus", purok, "addressLine", "residentSince")
    SELECT u.id, ${barangayId}::uuid, u.user_id, u.full_name, u.birth_date, u.sex, u.civil_status, u.purok, u.address_line, u.since
    FROM unnest(
      ${residentIds}::uuid[], ${r.map((_, i) => (i === 0 ? users.resident : null))}::uuid[], ${r.map((x) => x.fullName)}::text[],
      ${r.map((x) => x.birthDate)}::date[], ${r.map((x) => x.sex)}::text[]::"Sex"[],
      ${r.map((x) => x.civilStatus)}::text[]::"CivilStatus"[], ${r.map((x) => x.purok)}::int[],
      ${r.map((x) => x.addressLine)}::text[], ${r.map((x) => x.residentSince)}::int[]
    ) AS u(id, user_id, full_name, birth_date, sex, civil_status, purok, address_line, since)`;

  const typeIds = data.documentTypes.map(() => randomUUID());
  await tx.documentType.createMany({
    data: data.documentTypes.map((t, i) => ({ id: typeIds[i]!, barangayId, ...t })),
  });

  const counterIds = data.counters.map(() => randomUUID());
  await tx.counter.createMany({
    data: data.counters.map((c, i) => ({
      id: counterIds[i]!,
      barangayId,
      name: c.name,
      lanes: ["PRIORITY", "DOCUMENTS", "GENERAL"],
      open: c.open,
      staffId: c.staff ? users[c.staff] : null,
      sortOrder: c.sortOrder,
    })),
  });

  const requestIds = data.requests.map(() => randomUUID());
  const q = data.requests;
  await tx.$executeRaw`
    INSERT INTO "Request" (id, "barangayId", "residentId", "documentTypeId", purpose, "businessName", status, "feeCentavos",
      "rejectReason", "approvedById", "approvedAt", "orNumber", "releasedById", "releasedAt", "verificationCode", "validUntil",
      "createdAt", "updatedAt")
    SELECT u.id, ${barangayId}::uuid, u.resident_id, u.type_id, u.purpose, u.business, u.status, u.fee, u.reject, u.approved_by,
      u.approved_at, u.or_number, u.released_by, u.released_at, u.code, u.valid_until, u.created_at, u.updated_at
    FROM unnest(
      ${requestIds}::uuid[], ${q.map((x) => residentIds[x.residentIndex]!)}::uuid[], ${q.map((x) => typeIds[x.typeIndex]!)}::uuid[],
      ${q.map((x) => x.purpose)}::text[], ${q.map((x) => x.businessName)}::text[], ${q.map((x) => x.status)}::text[]::"RequestStatus"[],
      ${q.map((x) => x.feeCentavos)}::int[], ${q.map((x) => x.rejectReason)}::text[], ${q.map((x) => actorId(x.approvedBy))}::uuid[],
      ${q.map((x) => iso(x.approvedAt))}::timestamptz[], ${q.map((x) => x.orNumber)}::text[],
      ${q.map((x) => actorId(x.releasedBy))}::uuid[], ${q.map((x) => iso(x.releasedAt))}::timestamptz[],
      ${q.map((x) => x.verificationCode)}::text[], ${q.map((x) => iso(x.validUntil))}::timestamptz[],
      ${q.map((x) => iso(x.createdAt))}::timestamptz[], ${q.map((x) => iso(x.events.at(-1)!.at))}::timestamptz[]
    ) AS u(id, resident_id, type_id, purpose, business, status, fee, reject, approved_by, approved_at, or_number, released_by,
      released_at, code, valid_until, created_at, updated_at)`;

  const events = q.flatMap((x, i) => x.events.map((e) => ({ ...e, requestId: requestIds[i]! })));
  await tx.$executeRaw`
    INSERT INTO "RequestEvent" ("requestId", "fromStatus", "toStatus", "actorId", note, "createdAt")
    SELECT * FROM unnest(
      ${events.map((e) => e.requestId)}::uuid[], ${events.map((e) => e.from)}::text[]::"RequestStatus"[],
      ${events.map((e) => e.to)}::text[]::"RequestStatus"[], ${events.map((e) => actorId(e.actor))}::uuid[],
      ${events.map((e) => e.note)}::text[], ${events.map((e) => iso(e.at))}::timestamptz[]
    )`;

  const ticketIds = data.tickets.map(() => randomUUID());
  const t = data.tickets;
  await tx.$executeRaw`
    INSERT INTO "QueueTicket" (id, "barangayId", day, lane, number, code, status, source, "residentId", "requestId", "queuedAt",
      "calledAt", "servedAt", "counterId", "callCount", "createdAt")
    SELECT u.id, ${barangayId}::uuid, u.day, u.lane, u.number, u.code, u.status, u.source, u.resident_id, u.request_id, u.queued_at,
      u.called_at, u.served_at, u.counter_id, u.call_count, u.queued_at
    FROM unnest(
      ${ticketIds}::uuid[], ${t.map((x) => x.day)}::date[], ${t.map((x) => x.lane)}::text[]::"Lane"[], ${t.map((x) => x.number)}::int[],
      ${t.map((x) => ticketCode(x.lane, x.number))}::text[], ${t.map((x) => x.status)}::text[]::"TicketStatus"[],
      ${t.map((x) => x.source)}::text[]::"TicketSource"[],
      ${t.map((x) => (x.residentIndex === null ? null : residentIds[x.residentIndex]!))}::uuid[],
      ${t.map((x) => (x.requestIndex === null ? null : requestIds[x.requestIndex]!))}::uuid[],
      ${t.map((x) => iso(x.queuedAt))}::timestamptz[], ${t.map((x) => iso(x.calledAt))}::timestamptz[],
      ${t.map((x) => iso(x.servedAt))}::timestamptz[],
      ${t.map((x) => (x.counterIndex === null ? null : counterIds[x.counterIndex]!))}::uuid[], ${t.map((x) => x.callCount)}::int[]
    ) AS u(id, day, lane, number, code, status, source, resident_id, request_id, queued_at, called_at, served_at, counter_id, call_count)`;

  // The ticket Ate Liza is serving right now is Counter 1's current ticket.
  const calledIndex = t.findIndex((x) => x.status === "CALLED");
  if (calledIndex >= 0) {
    await tx.counter.update({
      where: { id: counterIds[t[calledIndex]!.counterIndex!]! },
      data: { currentTicketId: ticketIds[calledIndex]! },
    });
  }

  if (data.sequences.length > 0) {
    await tx.queueSequence.createMany({
      data: data.sequences.map((s) => ({
        barangayId,
        day: new Date(`${s.day}T00:00:00.000Z`),
        lane: s.lane,
        lastNumber: s.lastNumber,
      })),
    });
  }
}
