import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { QueueService } from "../src/queue/queue.service.js";
import { UsedJtiStore, verifySocketTicket } from "../src/realtime/socket-tickets.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { testEnv } from "./support/env.js";
import { RESIDENT_PASSWORD, seedBarangay, STAFF_PIN, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";

const SECRET = testEnv.SOCKET_TICKET_SECRET;

describe("socket tickets", () => {
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  let juan: string;
  let staff: string;
  let trackingToken: string;
  let kioskTicketId: string;
  const login = async (username: string, secret: string) =>
    (await call(t, "POST", "/api/auth/login", { body: { username, secret } })).body.accessToken as string;
  const decode = (ticket: string) => verifySocketTicket(ticket, SECRET, new UsedJtiStore(), t.clock.now());

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set("2026-10-28T02:00:00Z");
    await resetDb(db);
    b = await seedBarangay(db);
    juan = await login(b.residentUser.username, RESIDENT_PASSWORD);
    staff = await login(b.staff2.username, STAFF_PIN);
    const kiosk = await t.app.get(QueueService).takeTicket(b.barangay.id, { kind: "kiosk" }, { id: randomUUID(), lane: "GENERAL" });
    trackingToken = kiosk.trackingToken!;
    kioskTicketId = kiosk.ticket.id;
  });

  it("gives each subject only its own rooms", async () => {
    const resident = await call(t, "POST", "/api/realtime/ticket", { token: juan });
    expect(resident.status).toBe(200);
    expect(resident.body).toMatchObject({ url: "https://bqueue-api.test", expiresIn: 60 });
    expect(await decode(resident.body.ticket)).toMatchObject({
      kind: "user",
      brgy: b.barangay.id,
      rooms: [`b:${b.barangay.id}:public`, `u:${b.residentUser.id}`],
    });
    const staffTicket = await call(t, "POST", "/api/realtime/ticket", { token: staff });
    expect((await decode(staffTicket.body.ticket)).rooms).toEqual([
      `b:${b.barangay.id}:public`,
      `b:${b.barangay.id}:staff`,
      `u:${b.staff2.id}`,
    ]);
    const display = await call(t, "POST", "/api/realtime/display-ticket", { body: { key: b.keys.display } });
    expect(await decode(display.body.ticket)).toMatchObject({ kind: "display", rooms: [`b:${b.barangay.id}:public`] });
    const kiosk = await call(t, "POST", "/api/realtime/kiosk-ticket", { body: { key: b.keys.kiosk } });
    expect(await decode(kiosk.body.ticket)).toMatchObject({ kind: "kiosk", rooms: [`b:${b.barangay.id}:public`] });
    const tracker = await call(t, "POST", "/api/realtime/tracker-ticket", { body: { token: trackingToken } });
    expect(await decode(tracker.body.ticket)).toMatchObject({ kind: "tracker", rooms: [`t:${kioskTicketId}`] });
  });

  it("makes tickets single-use and valid for 60 seconds", async () => {
    const { ticket } = (await call(t, "POST", "/api/realtime/ticket", { token: juan })).body;
    const used = new UsedJtiStore();
    await expect(verifySocketTicket(ticket, SECRET, used, new Date(t.clock.now().getTime() + 61_000))).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await verifySocketTicket(ticket, SECRET, used, t.clock.now());
    await expect(verifySocketTicket(ticket, SECRET, used, t.clock.now())).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(verifySocketTicket(juan, SECRET, new UsedJtiStore(), t.clock.now())).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("refuses unknown keys and tokens", async () => {
    expect((await call(t, "POST", "/api/realtime/display-ticket", { body: { key: "x".repeat(43) } })).body.error.code).toBe("unauthenticated");
    expect((await call(t, "POST", "/api/realtime/tracker-ticket", { body: { token: "x".repeat(43) } })).body.error.code).toBe("unauthenticated");
  });

  it("answers session_expired once the demo barangay has ended", async () => {
    await db.barangay.update({ where: { id: b.barangay.id }, data: { expiresAt: new Date("2026-10-28T02:01:00Z") } });
    t.clock.set("2026-10-28T02:02:00Z");
    const answers = [
      await call(t, "POST", "/api/realtime/ticket", { token: juan }),
      await call(t, "POST", "/api/realtime/display-ticket", { body: { key: b.keys.display } }),
      await call(t, "POST", "/api/realtime/kiosk-ticket", { body: { key: b.keys.kiosk } }),
      await call(t, "POST", "/api/realtime/tracker-ticket", { body: { token: trackingToken } }),
    ];
    expect(answers.map((a) => [a.status, a.body.error?.code])).toEqual(Array(4).fill([401, "session_expired"]));
  });
});
