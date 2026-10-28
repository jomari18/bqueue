import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PresenceTracker } from "../src/common/presence.js";
import { mulberry32 } from "../src/demo/random.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { SimulatorService } from "../src/simulator/simulator.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { RESIDENT_PASSWORD, seedBarangay, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";
import { insertTicket } from "./support/tickets.js";

describe("simulator", () => {
  let t: TestApp;
  let db: PrismaService;
  let sim: SimulatorService;
  let b: TestBarangay;
  const lastHuman = async () => (await db.barangay.findUniqueOrThrow({ where: { id: b.barangay.id } })).lastHumanActionAt;
  const login = async () =>
    (await call(t, "POST", "/api/auth/login", { body: { username: b.residentUser.username, secret: RESIDENT_PASSWORD } }));

  beforeAll(async () => {
    t = await createTestApp({ env: { SIMULATOR_ENABLED: "true" } });
    db = t.app.get(PrismaService);
    sim = t.app.get(SimulatorService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set("2026-10-28T02:00:00Z");
    sim.stopAll();
    await resetDb(db);
    b = await seedBarangay(db);
  });

  it("acts as seeded residents, without logins, and never moves requests along", async () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 50; i++) await sim.residentStep(b.barangay.id, rng);
    const requests = await db.request.findMany({ include: { events: true } });
    expect(requests.length).toBeGreaterThan(5);
    expect(requests.every((r) => r.status === "SUBMITTED")).toBe(true);
    expect(requests.every((r) => r.events.every((e) => e.actorId === null))).toBe(true);
    expect(await db.queueTicket.count()).toBeGreaterThan(5);
  });

  it("serves at Counter 1 as Ate Liza", async () => {
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1 });
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 2, queuedAt: new Date("2026-10-28T01:01:00Z") });
    const rng = mulberry32(5);
    await sim.staffStep(b.barangay.id, rng);
    const c1 = await db.counter.findUniqueOrThrow({ where: { id: b.counters[0]!.id }, include: { currentTicket: true } });
    expect(c1.currentTicket?.code).toBe("G-001");
    await sim.staffStep(b.barangay.id, rng);
    const first = await db.queueTicket.findFirstOrThrow({ where: { number: 1 } });
    expect(["SERVED", "MISSED"]).toContain(first.status);
    expect((await db.counter.findUniqueOrThrow({ where: { id: b.counters[0]!.id }, include: { currentTicket: true } })).currentTicket?.code).toBe("G-002");
    await db.counter.update({ where: { id: b.counters[0]!.id }, data: { open: false, currentTicketId: null } });
    expect(await sim.staffStep(b.barangay.id, rng)).toBe("skipped");
  });

  it("leaves pickup numbers for a person at a counter, who checks the ID and releases", async () => {
    const request = await db.request.create({
      data: { id: randomUUID(), barangayId: b.barangay.id, residentId: b.resident.id, documentTypeId: b.types.CLEARANCE.id, purpose: "x", status: "READY_FOR_PICKUP", feeCentavos: 0 },
    });
    const pickup = await insertTicket(db, b.barangay.id, { lane: "DOCUMENTS", number: 1, residentId: b.resident.id, requestId: request.id });
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1, queuedAt: new Date("2026-10-28T01:05:00Z") });
    await db.counter.update({ where: { id: b.counters[0]!.id }, data: { lanes: ["PRIORITY", "DOCUMENTS", "GENERAL"] } });
    await sim.staffStep(b.barangay.id, mulberry32(5));
    const c1 = await db.counter.findUniqueOrThrow({ where: { id: b.counters[0]!.id }, include: { currentTicket: true } });
    expect(c1.currentTicket?.code).toBe("G-001");
    expect((await db.queueTicket.findUniqueOrThrow({ where: { id: pickup.id } })).status).toBe("WAITING");
  });

  it("counts only a person's business writes as human actions", async () => {
    const old = new Date("2026-10-28T01:00:00Z");
    await db.barangay.update({ where: { id: b.barangay.id }, data: { lastHumanActionAt: old } });
    const signIn = await login();
    const juan = signIn.body.accessToken as string;
    const cookie = (signIn.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
    await call(t, "POST", "/api/realtime/display-ticket", { body: { key: b.keys.display } });
    await call(t, "POST", "/api/realtime/ticket", { token: juan });
    await call(t, "POST", "/api/auth/refresh", { headers: { cookie, "x-requested-with": "bqueue" } });
    await call(t, "GET", "/api/queue/state", { token: juan });
    expect(await lastHuman()).toEqual(old);
    t.clock.set("2026-10-28T02:05:00Z");
    await call(t, "POST", "/api/requests", { token: juan, body: { id: randomUUID(), documentTypeId: b.types.CLEARANCE.id, purpose: "Employment" } });
    expect(await lastHuman()).toEqual(new Date("2026-10-28T02:05:00Z"));
  });

  it("pauses 20 minutes after the last human action and wakes on the next one", async () => {
    const presence = t.app.get(PresenceTracker);
    presence.connected(b.barangay.id);
    await sim.wake(b.barangay.id);
    expect(sim.isRunning(b.barangay.id)).toBe(true);
    await sim.tick(b.barangay.id, "resident");
    expect(sim.isRunning(b.barangay.id)).toBe(true);
    t.clock.set("2026-10-28T02:20:00Z");
    await sim.tick(b.barangay.id, "resident");
    expect(sim.isRunning(b.barangay.id)).toBe(false);
    const juan = (await login()).body.accessToken as string;
    await call(t, "POST", "/api/queue/tickets", { token: juan, body: { id: randomUUID(), lane: "GENERAL" } });
    await new Promise((r) => setTimeout(r, 100));
    expect(sim.isRunning(b.barangay.id)).toBe(true);
    presence.disconnected(b.barangay.id);
    sim.stopAll();
  });
});
