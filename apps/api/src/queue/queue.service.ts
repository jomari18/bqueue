import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type KioskTicketInput,
  manilaDate,
  type QueueCalledEvent,
  type QueueSnapshot,
  type TakeTicketInput,
  ticketCode,
  type TicketView,
} from "@bq/shared";
import type { AuthUser } from "../auth/subjects.js";
import { newOpaqueToken } from "../auth/tokens.js";
import { AppError } from "../common/app-error.js";
import { CLOCK, type Clock } from "../common/clock.js";
import type { QueueTicket } from "../generated/prisma/client.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import { assertOperator } from "./counter-views.js";
import { closeStaleTickets } from "./day-boundary.js";
import { EventsService } from "../realtime/events.service.js";
import { queueSnapshot, ticketPosition } from "./read-model.js";
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
  private readonly logger = new Logger("QueueService");

  constructor(
    protected readonly db: PrismaService,
    @Inject(CLOCK) protected readonly clock: Clock,
    private readonly events: EventsService,
  ) {}

  /**
   * Emits after a committed write. A failed emit never turns a saved change into an error: clients resync from
   * GET /api/queue/state on the next event or reconnect.
   */
  async publish(barangayId: string, called?: QueueCalledEvent, alsoTicketIds: string[] = []): Promise<void> {
    try {
      await this.events.queueChanged(barangayId, called, alsoTicketIds);
    } catch (err) {
      this.logger.warn(`emit failed: ${(err as Error).name}`);
    }
  }

  /** The snapshot for GET /api/queue/state; the first read of a new day closes yesterday's leftovers. */
  async state(barangayId: string): Promise<QueueSnapshot> {
    const today = manilaDate(this.clock.now());
    const changed = await this.db.$transaction((tx) => closeStaleTickets(tx, barangayId, today), QUEUE_TX);
    if (changed.length > 0) await this.publish(barangayId);
    return queueSnapshot(this.db, barangayId, today);
  }

  /** Today's tickets of one resident (My ticket), or today's waiting or missed tickets for staff. */
  async todaysTickets(barangayId: string, where: { residentUserId?: string; status?: "WAITING" | "MISSED" }): Promise<TicketView[]> {
    const today = manilaDate(this.clock.now());
    const rows = await this.db.queueTicket.findMany({
      where: {
        barangayId,
        day: dayDate(today),
        ...(where.residentUserId ? { resident: { userId: where.residentUserId } } : {}),
        ...(where.status ? { status: where.status } : {}),
      },
      orderBy: [{ queuedAt: "asc" }, { number: "asc" }],
    });
    return Promise.all(rows.map((t) => this.view(barangayId, t)));
  }

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

    if (!result.duplicate) await this.publish(barangayId);
    const ticket = await this.view(barangayId, result.ticket);
    return { ticket, duplicate: result.duplicate, ...(result.trackingToken ? { trackingToken: result.trackingToken } : {}) };
  }

  /**
   * Spec 6.5 in one transaction: lock the counter, refuse it while it still has a called ticket, then take the next
   * waiting ticket with FOR UPDATE SKIP LOCKED, Priority first, then the earliest. Concurrent counters skip each
   * other's locked rows instead of waiting, so they never call the same ticket. `skipPickups` is for the simulated
   * Counter 1, which cannot check an ID and release a document (final review 4).
   */
  async callNext(barangayId: string, staff: AuthUser, counterId: string, opts: { skipPickups?: boolean } = {}): Promise<TicketView | null> {
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
          AND (${opts.skipPickups ?? false} = false OR "requestId" IS NULL)
        ORDER BY (lane = 'PRIORITY') DESC, "queuedAt", number
        FOR UPDATE SKIP LOCKED
        LIMIT 1`;
      if (!next) return null;
      const ticket = await tx.queueTicket.update({
        where: { id: next.id },
        data: { status: "CALLED", counterId, calledAt: now, callCount: { increment: 1 } },
      });
      await tx.counter.update({ where: { id: counterId }, data: { currentTicketId: ticket.id } });
      return { ticket, version: await bumpVersion(tx, barangayId) };
    }, QUEUE_TX);
    if (!called) return null;
    const view = await this.view(barangayId, called.ticket);
    await this.publish(barangayId, this.calledEvent(called.version, view), [view.id]);
    return view;
  }

  /** Re-announces the counter's current ticket, up to 3 calls in all (spec 6.6). */
  async callAgain(barangayId: string, staff: AuthUser, ticketId: string): Promise<TicketView> {
    const ticket = await this.db.$transaction(async (tx) => {
      const t = await this.lockCurrent(tx, barangayId, staff, ticketId);
      if (t.callCount >= 3) throw new AppError("call_limit");
      const updated = await tx.queueTicket.update({ where: { id: t.id }, data: { callCount: { increment: 1 } } });
      return { ticket: updated, version: await bumpVersion(tx, barangayId) };
    }, QUEUE_TX);
    const view = await this.view(barangayId, ticket.ticket);
    await this.publish(barangayId, this.calledEvent(ticket.version, view), [view.id]);
    return view;
  }

  /**
   * Served or missed; either way the counter is free for the next call. A pickup is served only once its document is
   * released, or the request would wait for pickup with no number to call it (final review 4); missed stays allowed.
   */
  async finish(barangayId: string, staff: AuthUser, ticketId: string, outcome: "SERVED" | "MISSED"): Promise<TicketView> {
    const now = this.clock.now();
    const ticket = await this.db.$transaction(async (tx) => {
      const t = await this.lockCurrent(tx, barangayId, staff, ticketId);
      if (outcome === "SERVED" && t.requestId) {
        const request = await tx.request.findUnique({ where: { id: t.requestId }, select: { status: true } });
        if (request?.status === "READY_FOR_PICKUP") throw new AppError("release_first");
      }
      await tx.counter.update({ where: { id: t.counterId! }, data: { currentTicketId: null } });
      const updated = await tx.queueTicket.update({
        where: { id: t.id },
        data: { status: outcome, ...(outcome === "SERVED" ? { servedAt: now } : {}) },
      });
      await bumpVersion(tx, barangayId);
      return updated;
    }, QUEUE_TX);
    await this.publish(barangayId, undefined, [ticket.id]);
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
    await this.publish(barangayId, undefined, [ticket.id]);
    return this.view(barangayId, ticket);
  }

  private calledEvent(version: number, t: TicketView): QueueCalledEvent {
    return { version, code: t.code, lane: t.lane, counterName: t.counterName ?? "", callCount: t.callCount };
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
