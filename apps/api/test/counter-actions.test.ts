import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { KAPITAN_PASSWORD, RESIDENT_PASSWORD, seedBarangay, STAFF_PIN, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";
import { insertTicket } from "./support/tickets.js";

describe("counter actions", () => {
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  let staff: string;
  let kapitan: string;
  let juan: string;
  let c1: string;
  let c2: string;
  let c3: string;
  const at = (m: number) => new Date(Date.parse("2026-10-28T01:00:00Z") + m * 60_000);
  const login = async (username: string, secret: string) =>
    (await call(t, "POST", "/api/auth/login", { body: { username, secret } })).body.accessToken as string;
  const next = (token: string, counterId: string) => call(t, "POST", `/api/counters/${counterId}/call-next`, { token });
  const act = (token: string, ticketId: string, action: string) => call(t, "POST", `/api/queue/tickets/${ticketId}/${action}`, { token });
  const version = async () => Number((await db.barangay.findUniqueOrThrow({ where: { id: b.barangay.id } })).queueVersion);

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set("2026-10-28T02:00:00Z");
    await resetDb(db);
    b = await seedBarangay(db);
    [c1, c2, c3] = b.counters.map((c) => c.id) as [string, string, string];
    staff = await login(b.staff2.username, STAFF_PIN);
    kapitan = await login(b.kapitan.username, KAPITAN_PASSWORD);
    juan = await login(b.residentUser.username, RESIDENT_PASSWORD);
  });

  it("calls Priority first, then the earliest, only from the counter's lanes", async () => {
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1, queuedAt: at(0) });
    await insertTicket(db, b.barangay.id, { lane: "PRIORITY", number: 1, queuedAt: at(5) });
    const first = await next(staff, c2);
    expect(first.status).toBe(200);
    expect(first.body.ticket).toMatchObject({ code: "P-001", status: "CALLED", counterName: "Counter 2", callCount: 1 });
    await act(staff, first.body.ticket.id, "served");
    expect((await next(staff, c2)).body.ticket.code).toBe("G-001");
  });

  it("never calls another lane and answers null when nobody waits", async () => {
    await db.counter.update({ where: { id: c2 }, data: { lanes: ["GENERAL"] } });
    await insertTicket(db, b.barangay.id, { lane: "DOCUMENTS", number: 1 });
    const before = await version();
    const res = await next(staff, c2);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ticket: null });
    expect(await version()).toBe(before);
  });

  it("refuses a busy, closed or someone else's counter", async () => {
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1 });
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 2 });
    await next(staff, c2);
    expect((await next(staff, c2)).body.error.code).toBe("counter_busy");
    expect((await next(kapitan, c3)).body.error.code).toBe("invalid_transition");
    expect((await next(staff, c1)).status).toBe(403);
    expect((await next(kapitan, c1)).status).toBe(200);
  });

  it("calls a ticket at most 3 times", async () => {
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1 });
    const id = (await next(staff, c2)).body.ticket.id;
    expect((await act(staff, id, "call-again")).body.ticket.callCount).toBe(2);
    expect((await act(staff, id, "call-again")).body.ticket.callCount).toBe(3);
    expect((await act(staff, id, "call-again")).body.error.code).toBe("call_limit");
  });

  it("finishes a ticket as served or missed and frees the counter", async () => {
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1 });
    const id = (await next(staff, c2)).body.ticket.id;
    const served = await act(staff, id, "served");
    expect(served.body.ticket.status).toBe("SERVED");
    expect((await db.queueTicket.findUniqueOrThrow({ where: { id } })).servedAt).toEqual(t.clock.now());
    expect((await db.counter.findUniqueOrThrow({ where: { id: c2 } })).currentTicketId).toBeNull();
  });

  it("will not mark an unreleased pickup served, so the document is never stranded", async () => {
    const request = await db.request.create({
      data: { id: randomUUID(), barangayId: b.barangay.id, residentId: b.resident.id, documentTypeId: b.types.CLEARANCE.id, purpose: "x", status: "READY_FOR_PICKUP", feeCentavos: 0 },
    });
    await insertTicket(db, b.barangay.id, { lane: "DOCUMENTS", number: 1, residentId: b.resident.id, requestId: request.id });
    const called = (await next(staff, c2)).body.ticket;
    const refused = await act(staff, called.id, "served");
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("release_first");
    expect((await call(t, "POST", `/api/requests/${request.id}/release`, { token: staff, body: { idChecked: true } })).status).toBe(200);
    expect((await act(staff, called.id, "served")).status).toBe(200);
  });

  it("may still mark an unreleased pickup missed", async () => {
    const request = await db.request.create({
      data: { id: randomUUID(), barangayId: b.barangay.id, residentId: b.resident.id, documentTypeId: b.types.CLEARANCE.id, purpose: "x", status: "READY_FOR_PICKUP", feeCentavos: 0 },
    });
    await insertTicket(db, b.barangay.id, { lane: "DOCUMENTS", number: 1, residentId: b.resident.id, requestId: request.id });
    const called = (await next(staff, c2)).body.ticket;
    expect((await act(staff, called.id, "missed")).status).toBe(200);
  });

  it("lets a missed ticket rejoin once, at the end of its lane", async () => {
    const mine = await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1, queuedAt: at(0), residentId: b.resident.id });
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 2, queuedAt: at(1) });
    await next(staff, c2);
    await act(staff, mine.id, "missed");
    t.clock.set("2026-10-28T02:10:00Z");
    const back = await act(juan, mine.id, "rejoin");
    expect(back.body.ticket).toMatchObject({ code: "G-001", status: "WAITING", rejoined: true, callCount: 0, ahead: 1 });
    expect((await next(staff, c2)).body.ticket.code).toBe("G-002");
    await act(staff, (await db.queueTicket.findFirstOrThrow({ where: { number: 2 } })).id, "served");
    expect((await next(staff, c2)).body.ticket.code).toBe("G-001");
    await act(staff, mine.id, "missed");
    expect((await act(juan, mine.id, "rejoin")).body.error.code).toBe("invalid_transition");

    const other = await insertTicket(db, b.barangay.id, { lane: "DOCUMENTS", number: 1, status: "MISSED" });
    expect((await act(staff, other.id, "rejoin")).body.ticket.status).toBe("WAITING");
    const old = await insertTicket(db, b.barangay.id, { lane: "DOCUMENTS", number: 2, status: "MISSED", day: "2026-10-27" });
    expect((await act(staff, old.id, "rejoin")).status).toBe(409);
  });

  it("opens, closes and assigns counters", async () => {
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1 });
    await next(staff, c2);
    expect((await call(t, "POST", `/api/counters/${c2}/close`, { token: staff })).body.error.code).toBe("counter_busy");
    const moved = await call(t, "POST", `/api/counters/${c3}/assign`, { token: staff });
    expect(moved.status).toBe(200);
    expect(moved.body.staff).toMatchObject({ id: b.staff2.id });
    expect((await db.counter.findUniqueOrThrow({ where: { id: c2 } })).staffId).toBeNull();
    expect((await call(t, "POST", `/api/counters/${c1}/assign`, { token: staff })).status).toBe(403);
    const opened = await call(t, "POST", `/api/counters/${c3}/open`, { token: staff });
    expect(opened.body.open).toBe(true);
    const list = await call(t, "GET", "/api/counters", { token: staff });
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(["Counter 1", "Counter 2", "Counter 3"]);
    expect(list.body[1].current).toMatchObject({ code: "G-001", request: null });
  });
});
