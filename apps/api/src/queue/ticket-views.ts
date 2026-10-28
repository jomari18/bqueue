import type { TicketView } from "@bq/shared";
import type { QueueTicket } from "../generated/prisma/client.js";

export function toTicketView(
  t: QueueTicket,
  position: { ahead: number; etaMinutes: number },
  counterName: string | null,
): TicketView {
  return {
    id: t.id,
    code: t.code,
    lane: t.lane,
    number: t.number,
    status: t.status,
    source: t.source,
    queuedAt: t.queuedAt.toISOString(),
    calledAt: t.calledAt?.toISOString() ?? null,
    counterName,
    callCount: t.callCount,
    rejoined: t.rejoined,
    requestId: t.requestId,
    ahead: position.ahead,
    etaMinutes: position.etaMinutes,
  };
}
