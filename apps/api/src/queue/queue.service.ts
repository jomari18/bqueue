import { Inject, Injectable } from "@nestjs/common";
import { type KioskTicketInput, manilaDate, type TakeTicketInput, ticketCode, type TicketView } from "@bq/shared";
import { newOpaqueToken } from "../auth/tokens.js";
import { AppError } from "../common/app-error.js";
import { CLOCK, type Clock } from "../common/clock.js";
import type { QueueTicket } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
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
}
