import { DEFAULT_SERVICE_SECONDS, etaMinutes, type Lane, type TicketStatus } from "@bq/shared";
import type { PrismaService, Tx } from "../prisma/prisma.service.js";

// Plain read functions shared by the queue services, the events and the gateway (no Nest module, no cycles).

type Db = PrismaService | Tx;
type PositionTicket = { id: string; lane: Lane; status: TicketStatus; queuedAt: Date; number: number; day: Date };

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** Average seconds from call to served over the last 10 tickets served that day in the lane (spec 6.9). */
async function avgServiceSeconds(db: Db, barangayId: string, day: string, lane: Lane): Promise<number> {
  const [row] = await db.$queryRaw<{ avg: number | null }[]>`
    SELECT avg(EXTRACT(EPOCH FROM ("servedAt" - "calledAt")))::float8 AS avg FROM (
      SELECT "servedAt", "calledAt" FROM "QueueTicket"
      WHERE "barangayId" = ${barangayId}::uuid AND day = ${day}::date AND lane = ${lane}::"Lane" AND status = 'SERVED'
      ORDER BY "servedAt" DESC LIMIT 10
    ) recent`;
  return row?.avg ?? DEFAULT_SERVICE_SECONDS;
}

async function openCountersServing(db: Db, barangayId: string, lane: Lane): Promise<number> {
  return db.counter.count({ where: { barangayId, open: true, lanes: { has: lane } } });
}

/**
 * Spec 6.9: `ahead` counts the waiting tickets called before this one: earlier tickets in its lane, plus every
 * waiting Priority ticket when its lane is Documents or General. Called and finished tickets have nothing ahead.
 */
export async function ticketPosition(db: Db, barangayId: string, ticket: PositionTicket): Promise<{ ahead: number; etaMinutes: number }> {
  if (ticket.status !== "WAITING") return { ahead: 0, etaMinutes: 0 };
  const day = dayOf(ticket.day);
  const [row] = await db.$queryRaw<{ ahead: bigint }[]>`
    SELECT count(*) AS ahead FROM "QueueTicket"
    WHERE "barangayId" = ${barangayId}::uuid AND day = ${day}::date AND status = 'WAITING' AND id <> ${ticket.id}::uuid
      AND (
        (lane = ${ticket.lane}::"Lane" AND ("queuedAt", number) < (${ticket.queuedAt}::timestamptz, ${ticket.number}::int))
        OR (${ticket.lane}::text <> 'PRIORITY' AND lane = 'PRIORITY')
      )`;
  const ahead = Number(row!.ahead);
  const [avg, open] = await Promise.all([
    avgServiceSeconds(db, barangayId, day, ticket.lane),
    openCountersServing(db, barangayId, ticket.lane),
  ]);
  return { ahead, etaMinutes: etaMinutes(ahead, avg, open) };
}
