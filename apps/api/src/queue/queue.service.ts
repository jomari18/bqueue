import { Inject, Injectable } from "@nestjs/common";
import { type KioskTicketInput, manilaDate, type TakeTicketInput, ticketCode, type TicketView } from "@bq/shared";
import type { AuthUser } from "../auth/subjects.js";
import { newOpaqueToken } from "../auth/tokens.js";
import { AppError } from "../common/app-error.js";
import { CLOCK, type Clock } from "../common/clock.js";
import type { QueueTicket } from "../generated/prisma/client.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import { assertOperator } from "./counter-views.js";
import { closeStaleTickets } from "./day-boundary.js";
import { ticketPosition } from "./read-model.js";
import { bumpVersion, nextTicketNumber } from "./sequence.js";
import { toTicketView } from "./ticket-views.js";

/** Who takes a ticket: a resident (on a phone, or simulated without a login) or the kiosk. */
export type ResidentOrKiosk = { kind: "resident"; residentId: string; userId: string | null } | { kind: "kiosk" };

export type TakeResult = { ticket: TicketView; duplicate: boolean; trackingToken?: string };

const MAX_TICKETS_PER_DAY = 500;
export const QUEUE_TX = { maxWait: 5_000, timeout: 10_000 } as const;
const dayDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

@Injectable()
export class QueueService {
  constructor(
    protected readonly db: PrismaService,
    @Inject(CLOCK) protected readonly clock: Clock,
  ) {}

  /** A ticket's view with its live position and its counter's name. */
  async view(barangayId: string, t: QueueTicket): Promise<TicketView> {
    const [position, counter] = await Promise.all([
      ticketPosition(this.db, barangayId, t),
      t.counterId ? this.db.counter.findUnique({ where: { id: t.counterId }, select: { name: true } }) : null,
    ]);
    return toTicketView(t, position, counter?.name ?? null);
  }

  /**
   * Spec 6.4, 6.7, 6.8 and 6.11 in one transaction: idempotent by the client's id, one active ticket per lane for a
   * resident, pickup tickets only for the resident's ready request, at most 500 tickets a day, gap-free numbers.
   */
  async takeTicket(barangayId: string, subject: ResidentOrKiosk, input: TakeTicketInput | KioskTicketInput): Promise<TakeResult> {
    const now = this.clock.now();
    const today = manilaDate(now);
    const requestId = "requestId" in input ? input.requestId : undefined;

    const result = await this.db.$transaction(async (tx) => {
      const existing = await tx.queueTicket.findUnique({ where: { id: input.id } });
      if (existing) {
        const mine =
          existing.barangayId === barangayId &&
          (subject.kind === "kiosk" ? existing.source === "KIOSK" : existing.residentId === subject.residentId);
        if (!mine) throw new AppError("invalid_input", { field: "id" });
        if (subject.kind !== "kiosk") return { ticket: existing, duplicate: true };
        // The first answer may never have reached the kiosk, and only the token's hash is kept: issue a new one.
        const tracking = newOpaqueToken();
        const ticket = await tx.queueTicket.update({ where: { id: existing.id }, data: { trackingTokenHash: tracking.hash } });
        return { ticket, duplicate: true, trackingToken: tracking.token };
      }

      await closeStaleTickets(tx, barangayId, today);

      if (subject.kind === "resident") {
        const active = await tx.queueTicket.findFirst({
          where: { barangayId, residentId: subject.residentId, lane: input.lane, status: { in: ["WAITING", "CALLED"] } },
        });
        if (active) throw new AppError("already_in_queue", { extra: { ticket: await this.view(barangayId, active) } });
      }
      if (requestId) {
        if (input.lane !== "DOCUMENTS") throw new AppError("invalid_input", { field: "lane" });
        const request = await tx.request.findFirst({
          where: { id: requestId, barangayId, ...(subject.kind === "resident" ? { residentId: subject.residentId } : {}) },
        });
        if (!request || subject.kind === "kiosk") throw new AppError("not_found");
        if (request.status !== "READY_FOR_PICKUP") throw new AppError("invalid_transition");
      }
      if ((await tx.queueTicket.count({ where: { barangayId, day: dayDate(today) } })) >= MAX_TICKETS_PER_DAY) {
        throw new AppError("limit_reached");
      }

      const number = await nextTicketNumber(tx, barangayId, today, input.lane);
      const tracking = subject.kind === "kiosk" ? newOpaqueToken() : null;
      const ticket = await tx.queueTicket.create({
        data: {
          id: input.id,
          barangayId,
          day: dayDate(today),
          lane: input.lane,
          number,
          code: ticketCode(input.lane, number),
          status: "WAITING",
          source: subject.kind === "kiosk" ? "KIOSK" : "PHONE",
          residentId: subject.kind === "resident" ? subject.residentId : null,
          requestId: requestId ?? null,
          trackingTokenHash: tracking?.hash ?? null,
          queuedAt: now,
          createdAt: now,
        },
      });
      await bumpVersion(tx, barangayId);
      return { ticket, duplicate: false, trackingToken: tracking?.token };
    }, QUEUE_TX);

    const ticket = await this.view(barangayId, result.ticket);
    return { ticket, duplicate: result.duplicate, ...(result.trackingToken ? { trackingToken: result.trackingToken } : {}) };
  }

  /**
   * Spec 6.5 in one transaction: lock the counter, refuse it while it still has a called ticket, then take the next
   * waiting ticket with FOR UPDATE SKIP LOCKED, Priority first, then the earliest. Concurrent counters skip each
   * other's locked rows instead of waiting, so they never call the same ticket.
   */
  async callNext(barangayId: string, staff: AuthUser, counterId: string): Promise<TicketView | null> {
    const now = this.clock.now();
    const today = manilaDate(now);
    const called = await this.db.$transaction(async (tx) => {
      await closeStaleTickets(tx, barangayId, today);
      const [counter] = await tx.$queryRaw<{ id: string; open: boolean; staffId: string | null; currentTicketId: string | null; lanes: string[] }[]>`
        SELECT id, open, "staffId", "currentTicketId", lanes::text[] AS lanes FROM "Counter"
        WHERE id = ${counterId}::uuid AND "barangayId" = ${barangayId}::uuid FOR UPDATE`;
      if (!counter) throw new AppError("not_found");
      assertOperator(counter, staff);
      if (!counter.open) throw new AppError("invalid_transition");
      if (counter.currentTicketId) throw new AppError("counter_busy");
      const [next] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "QueueTicket"
        WHERE "barangayId" = ${barangayId}::uuid AND day = ${today}::date AND status = 'WAITING'
          AND lane::text = ANY(${counter.lanes}::text[])
        ORDER BY (lane = 'PRIORITY') DESC, "queuedAt", number
        FOR UPDATE SKIP LOCKED
        LIMIT 1`;
      if (!next) return null;
      const ticket = await tx.queueTicket.update({
        where: { id: next.id },
        data: { status: "CALLED", counterId, calledAt: now, callCount: { increment: 1 } },
      });
      await tx.counter.update({ where: { id: counterId }, data: { currentTicketId: ticket.id } });
      await bumpVersion(tx, barangayId);
      return ticket;
    }, QUEUE_TX);
    return called ? this.view(barangayId, called) : null;
  }

  /** Re-announces the counter's current ticket, up to 3 calls in all (spec 6.6). */
  async callAgain(barangayId: string, staff: AuthUser, ticketId: string): Promise<TicketView> {
    const ticket = await this.db.$transaction(async (tx) => {
      const t = await this.lockCurrent(tx, barangayId, staff, ticketId);
      if (t.callCount >= 3) throw new AppError("call_limit");
      const updated = await tx.queueTicket.update({ where: { id: t.id }, data: { callCount: { increment: 1 } } });
      await bumpVersion(tx, barangayId);
      return updated;
    }, QUEUE_TX);
    return this.view(barangayId, ticket);
  }

  /** Served or missed; either way the counter is free for the next call. */
  async finish(barangayId: string, staff: AuthUser, ticketId: string, outcome: "SERVED" | "MISSED"): Promise<TicketView> {
    const now = this.clock.now();
    const ticket = await this.db.$transaction(async (tx) => {
      const t = await this.lockCurrent(tx, barangayId, staff, ticketId);
      await tx.counter.update({ where: { id: t.counterId! }, data: { currentTicketId: null } });
      const updated = await tx.queueTicket.update({
        where: { id: t.id },
        data: { status: outcome, ...(outcome === "SERVED" ? { servedAt: now } : {}) },
      });
      await bumpVersion(tx, barangayId);
      return updated;
    }, QUEUE_TX);
    return this.view(barangayId, ticket);
  }

  /**
   * A missed ticket from today can rejoin once, by its resident or by staff: it waits again at the end of its lane
   * with the same code and, as a plan ruling, three fresh calls.
   */
  async rejoin(barangayId: string, actor: AuthUser, ticketId: string): Promise<TicketView> {
    const now = this.clock.now();
    const today = manilaDate(now);
    const ticket = await this.db.$transaction(async (tx) => {
      const t = await this.lockTicket(tx, barangayId, ticketId);
      if (actor.role === "RESIDENT") {
        const owner = t.residentId ? await tx.resident.findUnique({ where: { id: t.residentId }, select: { userId: true } }) : null;
        if (owner?.userId !== actor.userId) throw new AppError("not_found");
      }
      if (t.status !== "MISSED" || t.rejoined || t.day.toISOString().slice(0, 10) !== today) throw new AppError("invalid_transition");
      if (t.residentId) {
        const active = await tx.queueTicket.findFirst({
          where: { barangayId, residentId: t.residentId, lane: t.lane, status: { in: ["WAITING", "CALLED"] } },
        });
        if (active) throw new AppError("already_in_queue");
      }
      const updated = await tx.queueTicket.update({
        where: { id: t.id },
        data: { status: "WAITING", queuedAt: now, rejoined: true, callCount: 0, counterId: null, calledAt: null },
      });
      await bumpVersion(tx, barangayId);
      return updated;
    }, QUEUE_TX);
    return this.view(barangayId, ticket);
  }

  private async lockTicket(tx: Tx, barangayId: string, ticketId: string) {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "QueueTicket" WHERE id = ${ticketId}::uuid AND "barangayId" = ${barangayId}::uuid FOR UPDATE`;
    if (!locked) throw new AppError("not_found");
    return tx.queueTicket.findUniqueOrThrow({ where: { id: ticketId } });
  }

  /** The ticket must be the current, called ticket of a counter this person may operate. */
  private async lockCurrent(tx: Tx, barangayId: string, staff: AuthUser, ticketId: string) {
    const t = await this.lockTicket(tx, barangayId, ticketId);
    const counter = t.counterId ? await tx.counter.findUnique({ where: { id: t.counterId } }) : null;
    if (!counter) throw new AppError("invalid_transition");
    assertOperator(counter, staff);
    if (t.status !== "CALLED" || counter.currentTicketId !== t.id) throw new AppError("invalid_transition");
    return t;
  }
}
