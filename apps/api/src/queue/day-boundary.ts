import type { Tx } from "../prisma/prisma.service.js";
import { bumpVersion } from "./sequence.js";

/**
 * Spec 6.10: numbers restart each Manila day, so tickets from earlier days that are still waiting or called become
 * CANCELLED, and counters let go of them. Runs the first time the queue is touched on a new day and in the daily
 * cleanup (`barangayId` null = every barangay). Returns the barangays whose version changed.
 */
export async function closeStaleTickets(tx: Tx, barangayId: string | null, today: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ barangayId: string }[]>`
    WITH stale AS (
      UPDATE "QueueTicket" SET status = 'CANCELLED'
      WHERE (${barangayId}::uuid IS NULL OR "barangayId" = ${barangayId}::uuid)
        AND day < ${today}::date AND status IN ('WAITING', 'CALLED')
      RETURNING id, "barangayId"
    ), freed AS (
      UPDATE "Counter" SET "currentTicketId" = NULL WHERE "currentTicketId" IN (SELECT id FROM stale) RETURNING id
    )
    SELECT DISTINCT "barangayId" FROM stale`;
  const changed = rows.map((r) => r.barangayId);
  for (const id of changed) await bumpVersion(tx, id);
  return changed;
}
