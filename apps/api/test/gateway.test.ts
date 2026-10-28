import { randomUUID } from "node:crypto";
import type { Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PresenceTracker } from "../src/common/presence.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { QueueService } from "../src/queue/queue.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { KAPITAN_PASSWORD, RESIDENT_PASSWORD, seedBarangay, STAFF_PIN, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";
import { connectSocket, nextEvent, recordEvents, seenOf, wait } from "./support/sockets.js";
import { insertTicket } from "./support/tickets.js";

describe("Socket.io gateway", () => {
  let t: TestApp;
  let db: PrismaService;
  let a: TestBarangay;
  let tokens: { juan: string; staff: string; kapitan: string };
  const open: Socket[] = [];
  const login = async (username: string, secret: string) =>
    (await call(t, "POST", "/api/auth/login", { body: { username, secret } })).body.accessToken as string;
  const userTicket = async (token: string) => (await call(t, "POST", "/api/realtime/ticket", { token })).body.ticket as string;
  const connect = async (ticket: string, origin?: string) => {
    const socket = await connectSocket(t, ticket, { origin });
    open.push(socket);
    return socket;
  };
  const failure = (ticket: string | undefined, origin?: string) =>
    connectSocket(t, ticket, { origin }).then(
      () => "connected",
      (err: Error) => err.message,
    );

  beforeAll(async () => {
    t = await createTestApp({ listen: true });
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set(new Date().toISOString());
    await resetDb(db);
    a = await seedBarangay(db, { now: t.clock.now() });
    tokens = {
      juan: await login(a.residentUser.username, RESIDENT_PASSWORD),
      staff: await login(a.staff2.username, STAFF_PIN),
      kapitan: await login(a.kapitan.username, KAPITAN_PASSWORD),
    };
  });
  afterEach(() => {
    for (const s of open.splice(0)) s.close();
  });

  it("connects with a fresh ticket and sends the queue state", async () => {
    const socket = await connect(await userTicket(tokens.juan));
    await wait(200);
    const state = seenOf(socket).find((e) => e.event === "queue:state");
    expect(state?.payload).toMatchObject({ version: expect.any(Number), barangay: { name: "Barangay Masagana" } });
  });

  it("refuses a wrong origin, a missing ticket, a reused ticket and an ended barangay", async () => {
    expect(await failure(await userTicket(tokens.juan), "https://evil.test")).toBe("forbidden_origin");
    expect(await failure(undefined)).toBe("unauthorized");
    const ticket = await userTicket(tokens.juan);
    await connect(ticket);
    expect(await failure(ticket)).toBe("unauthorized");
    const late = await userTicket(tokens.juan);
    await db.barangay.update({ where: { id: a.barangay.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await failure(late)).toBe("session_expired");
  });

  it("keeps barangays and rooms apart", async () => {
    const b = await seedBarangay(db, { now: t.clock.now() });
    const bKapitan = await login(b.kapitan.username, KAPITAN_PASSWORD);
    const juan = await connect(await userTicket(tokens.juan));
    const staff = await connect(await userTicket(tokens.staff));
    const juanSeen = recordEvents(juan);
    await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1, day: new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) });
    await call(t, "POST", `/api/counters/${b.counters[1]!.id}/call-next`, { token: bKapitan });
    await wait(300);
    expect(juanSeen.filter((e) => e.event === "queue:called")).toEqual([]);

    const created = nextEvent(staff, "request:created");
    await call(t, "POST", "/api/requests", {
      token: tokens.juan,
      body: { id: randomUUID(), documentTypeId: a.types.CLEARANCE.id, purpose: "Employment" },
    });
    await created;
    expect(juanSeen.some((e) => e.event === "request:created")).toBe(false);

    const queue = t.app.get(QueueService);
    await queue.takeTicket(a.barangay.id, { kind: "resident", residentId: a.resident.id, userId: a.residentUser.id }, { id: randomUUID(), lane: "GENERAL" });
    const called = nextEvent<{ code: string }>(juan, "queue:called");
    const update = nextEvent<{ status: string }>(juan, "ticket:updated");
    await call(t, "POST", `/api/counters/${a.counters[1]!.id}/call-next`, { token: tokens.staff });
    expect((await called).code).toBe("G-001");
    expect((await update).status).toBe("CALLED");
  });

  it("gives a tracker only its own ticket", async () => {
    const queue = t.app.get(QueueService);
    const kiosk = await queue.takeTicket(a.barangay.id, { kind: "kiosk" }, { id: randomUUID(), lane: "DOCUMENTS" });
    const ticket = (await call(t, "POST", "/api/realtime/tracker-ticket", { body: { token: kiosk.trackingToken } })).body.ticket;
    const tracker = await connect(ticket);
    const seen = recordEvents(tracker);
    const update = nextEvent<{ ticketId: string }>(tracker, "ticket:updated");
    await call(t, "POST", `/api/counters/${a.counters[1]!.id}/call-next`, { token: tokens.staff });
    expect((await update).ticketId).toBe(kiosk.ticket.id);
    await wait(200);
    expect(seen.some((e) => e.event === "queue:changed" || e.event === "queue:called")).toBe(false);
  });

  it("ignores events sent by clients and drops oversized messages", async () => {
    const juan = await connect(await userTicket(tokens.juan));
    const staff = await connect(await userTicket(tokens.staff));
    const staffSeen = recordEvents(staff);
    juan.emit("queue:called", { code: "X-999" });
    await wait(300);
    expect(staffSeen.some((e) => e.event === "queue:called")).toBe(false);
    const gone = nextEvent(juan, "disconnect");
    juan.emit("big", "x".repeat(20_000));
    await gone;
  });

  it("disconnects on logout, deactivation and key rotation", async () => {
    const signIn = await call(t, "POST", "/api/auth/login", { body: { username: a.residentUser.username, secret: RESIDENT_PASSWORD } });
    const cookie = (signIn.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
    const juan = await connect(await userTicket(signIn.body.accessToken));
    const revoked = nextEvent(juan, "session:revoked");
    const gone = nextEvent(juan, "disconnect");
    await call(t, "POST", "/api/auth/logout", { headers: { cookie } });
    await revoked;
    await gone;

    const staff = await connect(await userTicket(tokens.staff));
    const staffGone = nextEvent(staff, "disconnect");
    await call(t, "PATCH", `/api/settings/staff/${a.staff2.id}`, { token: tokens.kapitan, body: { active: false } });
    await staffGone;

    const display = await connect((await call(t, "POST", "/api/realtime/display-ticket", { body: { key: a.keys.display } })).body.ticket);
    const kiosk = await connect((await call(t, "POST", "/api/realtime/kiosk-ticket", { body: { key: a.keys.kiosk } })).body.ticket);
    const displayGone = nextEvent(display, "disconnect");
    await call(t, "POST", "/api/settings/keys/display/rotate", { token: tokens.kapitan });
    await displayGone;
    await wait(200);
    expect(kiosk.connected).toBe(true);
  });

  it("counts connected sockets per barangay", async () => {
    const presence = t.app.get(PresenceTracker);
    const juan = await connect(await userTicket(tokens.juan));
    await wait(100);
    expect(presence.count(a.barangay.id)).toBe(1);
    juan.close();
    await wait(200);
    expect(presence.count(a.barangay.id)).toBe(0);
    expect(presence.lastLeftAt(a.barangay.id)).toBeInstanceOf(Date);
  });
});
