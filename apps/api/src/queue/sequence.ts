import type { Lane } from "@bq/shared";
import type { Tx } from "../prisma/prisma.service.js";

/**
 * The next number in a lane for a Manila day (spec 6.4). The upsert takes a row lock, so concurrent takes get
 * consecutive numbers with no gaps and no repeats, as long as the ticket is inserted in the same transaction.
 */
export async function nextTicketNumber(tx: Tx, barangayId: string, day: string, lane: Lane): Promise<number> {
  const [row] = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "QueueSequence" ("barangayId", day, lane, "lastNumber")
    VALUES (${barangayId}::uuid, ${day}::date, ${lane}::"Lane", 1)
    ON CONFLICT ("barangayId", day, lane) DO UPDATE SET "lastNumber" = "QueueSequence"."lastNumber" + 1
    RETURNING "lastNumber"`;
  return row!.lastNumber;
}

/** Every queue change raises the barangay's version in its transaction (spec 8.3). */
export async function bumpVersion(tx: Tx, barangayId: string): Promise<number> {
  const [row] = await tx.$queryRaw<{ queueVersion: bigint }[]>`
    UPDATE "Barangay" SET "queueVersion" = "queueVersion" + 1 WHERE id = ${barangayId}::uuid RETURNING "queueVersion"`;
  return Number(row!.queueVersion);
}
