import { randomUUID } from "node:crypto";
import { type Lane, ticketCode, type TicketStatus } from "@bq/shared";
import type { PrismaService } from "../../src/prisma/prisma.service.js";

/** Inserts a ticket directly, for setting up queue states in tests. */
export function insertTicket(
  db: PrismaService,
  barangayId: string,
  t: {
    lane: Lane;
    number: number;
    day?: string;
    status?: TicketStatus;
    queuedAt?: Date;
    calledAt?: Date | null;
    servedAt?: Date | null;
    residentId?: string | null;
    counterId?: string | null;
    callCount?: number;
    requestId?: string | null;
  },
) {
  return db.queueTicket.create({
    data: {
      id: randomUUID(),
      barangayId,
      day: new Date(`${t.day ?? "2026-10-28"}T00:00:00.000Z`),
      lane: t.lane,
      number: t.number,
      code: ticketCode(t.lane, t.number),
      status: t.status ?? "WAITING",
      source: "PHONE",
      residentId: t.residentId ?? null,
      queuedAt: t.queuedAt ?? new Date("2026-10-28T01:00:00Z"),
      calledAt: t.calledAt ?? null,
      servedAt: t.servedAt ?? null,
      counterId: t.counterId ?? null,
      callCount: t.callCount ?? 0,
      requestId: t.requestId ?? null,
    },
  });
}
