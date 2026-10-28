import { DEFAULT_SERVICE_SECONDS, etaMinutes, type Lane, type QueueSnapshot, type TicketStatus, type TicketUpdate } from "@bq/shared";
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

const LANE_ORDER: Lane[] = ["PRIORITY", "DOCUMENTS", "GENERAL"];

/**
 * The full public picture of a barangay's queue today (spec 8.2), read in one repeatable-read transaction so the
 * version matches the data. It names no residents.
 */
export async function queueSnapshot(db: PrismaService, barangayId: string, today: string): Promise<QueueSnapshot> {
  return db.$transaction(
    async (tx) => {
      const barangay = await tx.barangay.findUniqueOrThrow({ where: { id: barangayId } });
      const counters = await tx.counter.findMany({
        where: { barangayId },
        include: { currentTicket: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      const waiting = await tx.queueTicket.groupBy({
        by: ["lane"],
        where: { barangayId, day: new Date(`${today}T00:00:00.000Z`), status: "WAITING" },
        _count: { _all: true },
      });
      const calls = await tx.queueTicket.findMany({
        where: { barangayId, day: new Date(`${today}T00:00:00.000Z`), calledAt: { not: null } },
        include: { counter: { select: { name: true } } },
        orderBy: { calledAt: "desc" },
        take: 5,
      });
      const counts = Object.fromEntries(LANE_ORDER.map((l) => [l, 0])) as Record<Lane, number>;
      for (const w of waiting) counts[w.lane] = w._count._all;
      return {
        version: Number(barangay.queueVersion),
        day: today,
        barangay: { name: barangay.name, city: barangay.city },
        counters: counters.map((c) => ({
          id: c.id,
          name: c.name,
          open: c.open,
          lanes: c.lanes,
          currentCode: c.currentTicket?.code ?? null,
          currentLane: c.currentTicket?.lane ?? null,
          callCount: c.currentTicket?.callCount ?? 0,
        })),
        waiting: counts,
        lastCalls: calls.map((t) => ({
          code: t.code,
          lane: t.lane,
          counterName: t.counter?.name ?? "",
          calledAt: t.calledAt!.toISOString(),
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

/**
 * Every waiting and called ticket of the day (plus `alsoIds`, such as a ticket just served or missed) with its
 * position, and the room its owner listens on: `u:` for a resident with a login, `t:` for a kiosk ticket.
 */
export async function ticketUpdates(
  db: PrismaService,
  barangayId: string,
  today: string,
  alsoIds: string[] = [],
): Promise<{ room: string | null; update: TicketUpdate }[]> {
  return db.$transaction(
    async (tx) => {
      const barangay = await tx.barangay.findUniqueOrThrow({ where: { id: barangayId }, select: { queueVersion: true } });
      const day = new Date(`${today}T00:00:00.000Z`);
      const tickets = await tx.queueTicket.findMany({
        where: { barangayId, day, OR: [{ status: { in: ["WAITING", "CALLED"] } }, { id: { in: alsoIds } }] },
        include: { resident: { select: { userId: true } }, counter: { select: { name: true } } },
        orderBy: [{ queuedAt: "asc" }, { number: "asc" }],
      });
      const counters = await tx.counter.findMany({ where: { barangayId, open: true }, select: { lanes: true } });
      const avg = {} as Record<Lane, number>;
      for (const lane of LANE_ORDER) avg[lane] = await avgServiceSeconds(tx, barangayId, today, lane);
      const waiting = tickets.filter((t) => t.status === "WAITING");
      const priorityWaiting = waiting.filter((t) => t.lane === "PRIORITY").length;
      const seen: Record<Lane, number> = { PRIORITY: 0, DOCUMENTS: 0, GENERAL: 0 };
      const ahead = new Map<string, number>();
      for (const t of waiting) {
        ahead.set(t.id, seen[t.lane] + (t.lane === "PRIORITY" ? 0 : priorityWaiting));
        seen[t.lane] += 1;
      }
      return tickets.map((t) => {
        const a = ahead.get(t.id) ?? 0;
        const open = counters.filter((c) => c.lanes.includes(t.lane)).length;
        return {
          room: t.resident?.userId ? `u:${t.resident.userId}` : t.source === "KIOSK" ? `t:${t.id}` : null,
          update: {
            version: Number(barangay.queueVersion),
            ticketId: t.id,
            code: t.code,
            lane: t.lane,
            status: t.status,
            ahead: a,
            etaMinutes: t.status === "WAITING" ? etaMinutes(a, avg[t.lane], open) : 0,
            counterName: t.counter?.name ?? null,
            callCount: t.callCount,
            rejoined: t.rejoined,
          },
        };
      });
    },
    { isolationLevel: "RepeatableRead" },
  );
}
