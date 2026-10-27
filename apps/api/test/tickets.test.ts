import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/auth/tokens.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { QueueService } from "../src/queue/queue.service.js";
import { ticketPosition } from "../src/queue/read-model.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { addResidents, RESIDENT_PASSWORD, seedBarangay, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";
import { insertTicket } from "./support/tickets.js";

describe("taking tickets", () => {
  let t: TestApp;
  let db: PrismaService;
  let queue: QueueService;
  let b: TestBarangay;
  let juan: string;
  const take = (body: Record<string, unknown>) => call(t, "POST", "/api/queue/tickets", { token: juan, body: { id: randomUUID(), ...body } });
  const version = async () => Number((await db.barangay.findUniqueOrThrow({ where: { id: b.barangay.id } })).queueVersion);
  const sim = (residentId: string) => ({ kind: "resident" as const, residentId, userId: null });

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(PrismaService);
    queue = t.app.get(QueueService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set("2026-10-28T02:00:00Z");
    await resetDb(db);
    b = await seedBarangay(db);
    juan = (await call(t, "POST", "/api/auth/login", { body: { username: b.residentUser.username, secret: RESIDENT_PASSWORD } })).body
      .accessToken;
  });

  it("numbers each lane from 001 and allows one active ticket per lane", async () => {
    const first = await take({ lane: "DOCUMENTS" });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ duplicate: false, ticket: { code: "D-001", status: "WAITING", ahead: 0, etaMinutes: 0 } });
    const again = await take({ lane: "DOCUMENTS" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_in_queue");
    expect(again.body.ticket.code).toBe("D-001");
    expect((await take({ lane: "GENERAL" })).body.ticket.code).toBe("G-001");
  });

  it("returns the stored ticket for a repeated id", async () => {
    const id = randomUUID();
    await take({ id, lane: "GENERAL" });
    const again = await take({ id, lane: "GENERAL" });
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(await db.queueTicket.count()).toBe(1);
    expect((await db.queueSequence.findFirstOrThrow()).lastNumber).toBe(1);
  });

  it("gives 50 concurrent takes the numbers 1 to 50", async () => {
    const people = await addResidents(db, b.barangay.id, 50);
    const results = await Promise.all(
      people.map((p) => queue.takeTicket(b.barangay.id, sim(p.id), { id: randomUUID(), lane: "DOCUMENTS" })),
    );
    expect(results.map((r) => r.ticket.number).sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("links pickup tickets to a ready request of the resident", async () => {
    const request = async (status: "READY_FOR_PICKUP" | "SUBMITTED", residentId = b.resident.id) =>
      (
        await db.request.create({
          data: { id: randomUUID(), barangayId: b.barangay.id, residentId, documentTypeId: b.types.CLEARANCE.id, purpose: "x", status, feeCentavos: 0 },
        })
      ).id;
    const ready = await request("READY_FOR_PICKUP");
    expect((await take({ lane: "GENERAL", requestId: ready })).body.error.field).toBe("lane");
    const ok = await take({ lane: "DOCUMENTS", requestId: ready });
    expect(ok.body.ticket.requestId).toBe(ready);
    await db.queueTicket.updateMany({ data: { status: "SERVED" } });
    expect((await take({ lane: "DOCUMENTS", requestId: await request("SUBMITTED") })).body.error.code).toBe("invalid_transition");
    expect((await take({ lane: "DOCUMENTS", requestId: await request("READY_FOR_PICKUP", b.residents[0]!.id) })).status).toBe(404);
  });

  it("stops at 500 tickets a day", async () => {
    await db.queueTicket.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        id: randomUUID(),
        barangayId: b.barangay.id,
        day: new Date("2026-10-28T00:00:00.000Z"),
        lane: "GENERAL" as const,
        number: i + 1,
        code: `G-${i + 1}`,
        status: "SERVED" as const,
        source: "KIOSK" as const,
        queuedAt: new Date("2026-10-28T01:00:00Z"),
      })),
    });
    expect((await take({ lane: "PRIORITY" })).body.error.code).toBe("limit_reached");
  });

  it("gives kiosk tickets a tracking token and rotates it on a retry", async () => {
    const id = randomUUID();
    const first = await queue.takeTicket(b.barangay.id, { kind: "kiosk" }, { id, lane: "GENERAL" });
    expect(first.trackingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await db.queueTicket.findUniqueOrThrow({ where: { id } })).trackingTokenHash).toBe(sha256Hex(first.trackingToken!));
    const again = await queue.takeTicket(b.barangay.id, { kind: "kiosk" }, { id, lane: "GENERAL" });
    expect(again.duplicate).toBe(true);
    expect(again.ticket.code).toBe(first.ticket.code);
    expect(again.trackingToken).not.toBe(first.trackingToken);
    expect((await db.queueTicket.findUniqueOrThrow({ where: { id } })).trackingTokenHash).toBe(sha256Hex(again.trackingToken!));
  });

  it("starts a new day at 001 and cancels yesterday's leftovers", async () => {
    t.clock.set("2026-10-28T15:59:00Z"); // 23:59 in Manila
    const late = await queue.takeTicket(b.barangay.id, sim(b.resident.id), { id: randomUUID(), lane: "DOCUMENTS" });
    expect(late.ticket.code).toBe("D-001");
    const called = await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1, status: "CALLED", counterId: b.counters[1]!.id });
    await db.counter.update({ where: { id: b.counters[1]!.id }, data: { currentTicketId: called.id } });
    const before = await version();
    t.clock.set("2026-10-28T16:01:00Z"); // 00:01 the next day
    const next = await queue.takeTicket(b.barangay.id, sim(b.residents[0]!.id), { id: randomUUID(), lane: "DOCUMENTS" });
    expect(next.ticket.code).toBe("D-001");
    expect((await db.queueTicket.findUniqueOrThrow({ where: { id: late.ticket.id } })).status).toBe("CANCELLED");
    expect((await db.queueTicket.findUniqueOrThrow({ where: { id: called.id } })).status).toBe("CANCELLED");
    expect((await db.counter.findUniqueOrThrow({ where: { id: b.counters[1]!.id } })).currentTicketId).toBeNull();
    expect(await version()).toBe(before + 2); // one for the day close, one for the take
  });

  it("raises the queue version by one per take", async () => {
    const before = await version();
    await take({ lane: "GENERAL" });
    expect(await version()).toBe(before + 1);
  });

  it("estimates the wait from the people ahead, recent service times and open counters", async () => {
    const at = (m: number) => new Date(Date.parse("2026-10-28T01:00:00Z") + m * 60_000);
    await insertTicket(db, b.barangay.id, { lane: "PRIORITY", number: 1, queuedAt: at(30) });
    await insertTicket(db, b.barangay.id, { lane: "PRIORITY", number: 2, queuedAt: at(31) });
    for (let i = 1; i <= 3; i++) await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: i, queuedAt: at(i) });
    const mine = await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 4, queuedAt: at(10) });
    expect(await ticketPosition(db, b.barangay.id, mine)).toEqual({ ahead: 5, etaMinutes: 10 });
    const priority = await db.queueTicket.findFirstOrThrow({ where: { lane: "PRIORITY", number: 2 } });
    expect((await ticketPosition(db, b.barangay.id, priority)).ahead).toBe(1);
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 5, status: "SERVED", calledAt: at(0), servedAt: at(2) });
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 6, status: "SERVED", calledAt: at(0), servedAt: at(3) });
    expect(await ticketPosition(db, b.barangay.id, mine)).toEqual({ ahead: 5, etaMinutes: Math.ceil((5 * 150) / 60 / 2) });
  });

  it("cancels yesterday's waiting tickets in the daily cleanup", async () => {
    const old = await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1, day: "2026-10-27" });
    await call(t, "POST", "/api/admin/cleanup", { headers: { "x-cleanup-secret": "test-cleanup-secret-0123456789abcdef" } });
    expect((await db.queueTicket.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("CANCELLED");
  });
});
