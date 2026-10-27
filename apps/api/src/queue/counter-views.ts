import type { CounterView } from "@bq/shared";
import { AppError } from "../common/app-error.js";
import type { AuthUser } from "../auth/subjects.js";
import { REQUEST_INCLUDE, toRequestSummary } from "../documents/views.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { ticketPosition } from "./read-model.js";
import { toTicketView } from "./ticket-views.js";

/** Staff work only at the counter assigned to them; the kapitan may act at any counter (plan ruling). */
export function assertOperator(counter: { staffId: string | null }, actor: AuthUser): void {
  if (actor.role === "KAPITAN") return;
  if (actor.role !== "STAFF" || counter.staffId !== actor.userId) throw new AppError("forbidden");
}

/** Counters with their staff and current ticket (and its linked request, for a pickup). */
export async function counterViews(db: PrismaService, barangayId: string, ids?: string[]): Promise<CounterView[]> {
  const rows = await db.counter.findMany({
    where: { barangayId, ...(ids ? { id: { in: ids } } : {}) },
    include: {
      staff: { select: { id: true, displayName: true } },
      currentTicket: { include: { request: { include: REQUEST_INCLUDE } } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return Promise.all(
    rows.map(async (c) => {
      const t = c.currentTicket;
      const current = t
        ? { ...toTicketView(t, await ticketPosition(db, barangayId, t), c.name), request: t.request ? toRequestSummary(t.request) : null }
        : null;
      return { id: c.id, name: c.name, lanes: c.lanes, open: c.open, sortOrder: c.sortOrder, staff: c.staff, current };
    }),
  );
}
