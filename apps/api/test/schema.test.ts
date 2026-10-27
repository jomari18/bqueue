import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, testDb } from "./support/db.js";
import { seedBarangay } from "./support/factories.js";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const day = new Date("2026-10-28T00:00:00.000Z");

function ticket(barangayId: string, number: number, extra: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    barangayId,
    day,
    lane: "DOCUMENTS" as const,
    number,
    code: `D-${String(number).padStart(3, "0")}`,
    status: "WAITING" as const,
    source: "PHONE" as const,
    queuedAt: new Date("2026-10-28T02:00:00Z"),
    ...extra,
  };
}

describe("schema", () => {
  it("deletes everything a barangay owns with it", async () => {
    const b = await seedBarangay(db);
    await db.barangay.delete({ where: { id: b.barangay.id } });
    expect(await db.user.count()).toBe(0);
    expect(await db.resident.count()).toBe(0);
    expect(await db.counter.count()).toBe(0);
    expect(await db.documentType.count()).toBe(0);
    expect(await db.session.count()).toBe(0);
    expect(await db.queueSequence.count()).toBe(0);
  });

  it("never repeats a number in a lane on a day", async () => {
    const b = await seedBarangay(db);
    await db.queueTicket.create({ data: ticket(b.barangay.id, 7) });
    await expect(db.queueTicket.create({ data: ticket(b.barangay.id, 7) })).rejects.toThrow();
  });

  it("allows one CALLED ticket per counter", async () => {
    const b = await seedBarangay(db);
    const counterId = b.counters[0]!.id;
    await db.queueTicket.create({ data: ticket(b.barangay.id, 1, { status: "CALLED", counterId }) });
    await expect(
      db.queueTicket.create({ data: ticket(b.barangay.id, 2, { status: "CALLED", counterId }) }),
    ).rejects.toThrow();
  });

  it("keeps verification codes for released requests only", async () => {
    const b = await seedBarangay(db);
    const data = {
      id: randomUUID(),
      barangayId: b.barangay.id,
      residentId: b.resident.id,
      documentTypeId: b.types.CLEARANCE.id,
      purpose: "Employment",
      status: "SUBMITTED" as const,
      feeCentavos: 10000,
    };
    await expect(db.request.create({ data: { ...data, verificationCode: "ABCDEFGHJK" } })).rejects.toThrow();
    await expect(db.request.create({ data: { ...data, status: "RELEASED" } })).rejects.toThrow();
  });

  it("indexes every foreign key column", async () => {
    const missing = await db.$queryRaw<{ table: string; column: string }[]>`
      SELECT c.conrelid::regclass::text AS table, a.attname AS column
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND NOT EXISTS (
        SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
      )`;
    expect(missing).toEqual([]);
  });
});
