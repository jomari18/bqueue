import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SocketHub } from "../src/common/socket-hub.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { QueueService } from "../src/queue/queue.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { KAPITAN_PASSWORD, RESIDENT_PASSWORD, seedBarangay, STAFF_PIN, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";
import { RecordingSocketHub } from "./support/recording-hub.js";
import { insertTicket } from "./support/tickets.js";

describe("queue state and events", () => {
  const hub = new RecordingSocketHub();
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  let juan: string;
  let staff: string;
  const at = (m: number) => new Date(Date.parse("2026-10-28T01:00:00Z") + m * 60_000);
  const login = async (username: string, secret: string) =>
    (await call(t, "POST", "/api/auth/login", { body: { username, secret } })).body.accessToken as string;

  beforeAll(async () => {
    t = await createTestApp({ configure: (m) => m.overrideProvider(SocketHub).useValue(hub) });
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set("2026-10-28T02:00:00Z");
    await resetDb(db);
    hub.clear();
    b = await seedBarangay(db);
    juan = await login(b.residentUser.username, RESIDENT_PASSWORD);
    staff = await login(b.staff2.username, STAFF_PIN);
  });

  it("gives everyone who may watch the same snapshot", async () => {
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1, queuedAt: at(0), residentId: b.residents[0]!.id });
    await insertTicket(db, b.barangay.id, { lane: "PRIORITY", number: 1, queuedAt: at(1), residentId: b.residents[1]!.id });
    await call(t, "POST", `/api/counters/${b.counters[1]!.id}/call-next`, { token: staff });
    const asResident = await call(t, "GET", "/api/queue/state", { token: juan });
    expect(asResident.status).toBe(200);
    const snap = asResident.body;
    expect(snap).toMatchObject({
      version: expect.any(Number),
      day: "2026-10-28",
      barangay: { name: "Barangay Masagana", city: "Lungsod ng Kalayaan" },
      waiting: { PRIORITY: 0, DOCUMENTS: 0, GENERAL: 1 },
    });
    expect(snap.counters.map((c: { name: string; open: boolean; currentCode: string | null }) => [c.name, c.open, c.currentCode])).toEqual([
      ["Counter 1", true, null],
      ["Counter 2", true, "P-001"],
      ["Counter 3", false, null],
    ]);
    expect(snap.lastCalls).toEqual([expect.objectContaining({ code: "P-001", counterName: "Counter 2" })]);
    const keyHeaders: Record<string, string>[] = [{ "x-display-key": b.keys.display }, { "x-kiosk-key": b.keys.kiosk }];
    for (const headers of keyHeaders) {
      expect((await call(t, "GET", "/api/queue/state", { headers })).body).toEqual(snap);
    }
    expect(JSON.stringify(snap)).not.toContain("Residente");
  });

  it("refuses readers without a token or a valid key", async () => {
    expect((await call(t, "GET", "/api/queue/state")).status).toBe(401);
    const wrong = await call(t, "GET", "/api/queue/state", { headers: { "x-display-key": "x".repeat(43) } });
    expect(wrong.body.error.code).toBe("unauthenticated");
    await db.barangay.update({ where: { id: b.barangay.id }, data: { expiresAt: new Date("2026-10-28T01:00:00Z") } });
    const expired = await call(t, "GET", "/api/queue/state", { headers: { "x-display-key": b.keys.display } });
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("session_expired");
  });

  it("lists my tickets for today and the missed ones for staff", async () => {
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1, residentId: b.resident.id });
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1, residentId: b.resident.id, day: "2026-10-27", status: "SERVED" });
    await insertTicket(db, b.barangay.id, { lane: "DOCUMENTS", number: 1, residentId: b.residents[0]!.id, status: "MISSED" });
    const mine = await call(t, "GET", "/api/queue/tickets/mine", { token: juan });
    expect(mine.body.map((x: { code: string }) => x.code)).toEqual(["G-001"]);
    const missed = await call(t, "GET", "/api/queue/tickets?status=MISSED", { token: staff });
    expect(missed.body.map((x: { code: string }) => x.code)).toEqual(["D-001"]);
  });

  it("emits the snapshot, the call and every affected ticket after call next", async () => {
    const queue = t.app.get(QueueService);
    await queue.takeTicket(b.barangay.id, { kind: "resident", residentId: b.resident.id, userId: b.residentUser.id }, { id: crypto.randomUUID(), lane: "GENERAL" });
    const kiosk = await queue.takeTicket(b.barangay.id, { kind: "kiosk" }, { id: crypto.randomUUID(), lane: "GENERAL" });
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 99, queuedAt: at(-30) });
    hub.clear();
    const res = await call(t, "POST", `/api/counters/${b.counters[1]!.id}/call-next`, { token: staff });
    const events = hub.emitted.map((e) => [e.event, e.room]);
    expect(events.slice(0, 2)).toEqual([
      ["queue:changed", `b:${b.barangay.id}:public`],
      ["queue:called", `b:${b.barangay.id}:public`],
    ]);
    const changed = hub.emitted[0]!.payload as { version: number };
    expect(hub.emitted[1]!.payload).toEqual({ version: changed.version, code: "G-099", lane: "GENERAL", counterName: "Counter 2", callCount: 1 });
    const juanUpdate = hub.emitted.find((e) => e.room === `u:${b.residentUser.id}`)!.payload as { ahead: number; code: string };
    expect(juanUpdate).toMatchObject({ code: "G-001", ahead: 0 });
    expect(hub.emitted.find((e) => e.room === `t:${kiosk.ticket.id}`)!.payload).toMatchObject({ code: "G-002", ahead: 1 });

    hub.clear();
    await call(t, "POST", `/api/queue/tickets/${res.body.ticket.id}/call-again`, { token: staff });
    expect(hub.emitted.find((e) => e.event === "queue:called")!.payload).toMatchObject({ callCount: 2 });

    hub.clear();
    await queue.takeTicket(b.barangay.id, { kind: "resident", residentId: b.residents[2]!.id, userId: null }, { id: crypto.randomUUID(), lane: "DOCUMENTS" });
    expect(hub.emitted.some((e) => e.event === "queue:changed")).toBe(true);
    expect(hub.emitted.some((e) => e.event === "queue:called")).toBe(false);
  });

  it("tells a resident when their ticket was served", async () => {
    const queue = t.app.get(QueueService);
    const kapitan = await login(b.kapitan.username, KAPITAN_PASSWORD);
    const mine = await queue.takeTicket(b.barangay.id, { kind: "resident", residentId: b.resident.id, userId: b.residentUser.id }, { id: crypto.randomUUID(), lane: "GENERAL" });
    await call(t, "POST", `/api/counters/${b.counters[1]!.id}/call-next`, { token: kapitan });
    hub.clear();
    await call(t, "POST", `/api/queue/tickets/${mine.ticket.id}/served`, { token: kapitan });
    expect(hub.emitted.find((e) => e.room === `u:${b.residentUser.id}`)!.payload).toMatchObject({ status: "SERVED" });
  });
});
