import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { KAPITAN_PASSWORD, RESIDENT_PASSWORD, seedBarangay, STAFF_PIN, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";
import { type Ids, ROUTES, type SubjectKind } from "./support/routes.js";
import { insertTicket } from "./support/tickets.js";

const SUBJECTS: SubjectKind[] = ["anonymous", "resident", "staff", "kapitan", "display", "kiosk"];

describe("permissions and barangay isolation (spec 1.3, criteria 4 and 5)", () => {
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  let ids: Ids;
  let auth: Record<SubjectKind, { token?: string; headers?: Record<string, string> }>;
  const login = async (username: string, secret: string) =>
    (await call(t, "POST", "/api/auth/login", { body: { username, secret } })).body.accessToken as string;

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set("2026-10-28T02:00:00Z");
    await resetDb(db);
    b = await seedBarangay(db);
    const request = async (status: "SUBMITTED" | "FOR_APPROVAL" | "READY_FOR_PICKUP" | "RELEASED", residentId = b.resident.id) => {
      const id = randomUUID();
      await db.request.create({
        data: {
          id,
          barangayId: b.barangay.id,
          residentId,
          documentTypeId: b.types.CLEARANCE.id,
          purpose: "Employment",
          status,
          feeCentavos: 10000,
          ...(status === "RELEASED"
            ? { verificationCode: id.slice(0, 10).toUpperCase().replace(/[^0-9A-Z]/g, "0"), releasedAt: t.clock.now(), validUntil: new Date("2027-01-01T00:00:00Z") }
            : {}),
        },
      });
      return id;
    };
    const called = await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: 1, status: "CALLED", counterId: b.counters[1]!.id, callCount: 1, calledAt: t.clock.now() });
    await db.counter.update({ where: { id: b.counters[1]!.id }, data: { currentTicketId: called.id } });
    const missed = await insertTicket(db, b.barangay.id, { lane: "DOCUMENTS", number: 1, status: "MISSED", residentId: b.resident.id });
    ids = {
      documentTypeId: b.types.CLEARANCE.id,
      submitted: await request("SUBMITTED"),
      toForward: await request("SUBMITTED", b.residents[0]!.id),
      toReject: await request("SUBMITTED", b.residents[1]!.id),
      forApproval: await request("FOR_APPROVAL", b.residents[2]!.id),
      ready: await request("READY_FOR_PICKUP", b.residents[3]!.id),
      released: await request("RELEASED"),
      counter: b.counters[1]!.id,
      otherCounter: b.counters[2]!.id,
      calledTicket: called.id,
      missedTicket: missed.id,
      staffId: b.staff1.id,
    };
    auth = {
      anonymous: {},
      resident: { token: await login(b.residentUser.username, RESIDENT_PASSWORD) },
      staff: { token: await login(b.staff2.username, STAFF_PIN) },
      kapitan: { token: await login(b.kapitan.username, KAPITAN_PASSWORD) },
      display: { headers: { "x-display-key": b.keys.display } },
      kiosk: { headers: { "x-kiosk-key": b.keys.kiosk } },
    };
  });

  it("lets each subject call exactly the routes of spec 7.4", async () => {
    const wrong: string[] = [];
    for (const route of ROUTES) {
      const acceptsUsers = route.allow.some((k) => k === "resident" || k === "staff" || k === "kapitan");
      for (const subject of SUBJECTS) {
        const res = await call(t, route.method, route.path(ids), { ...auth[subject], body: route.body?.(ids) });
        const label = `${route.method} ${route.path(ids)} as ${subject}: ${res.status} ${res.body?.error?.code ?? ""}`;
        if (route.allow.includes(subject)) {
          if (res.status === 401 || res.status === 403) wrong.push(`${label} (should be allowed)`);
        } else {
          const userSubject = subject === "resident" || subject === "staff" || subject === "kapitan";
          const expected = userSubject && acceptsUsers ? 403 : 401;
          if (res.status !== expected) wrong.push(`${label} (expected ${expected})`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("answers 404 for another barangay's ids", async () => {
    const other = await seedBarangay(db);
    const outsider = await login(other.kapitan.username, KAPITAN_PASSWORD);
    const leaks: string[] = [];
    for (const route of ROUTES) {
      const path = route.path(ids);
      if (!route.allow.includes("kapitan") || !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(path)) continue;
      const res = await call(t, route.method, path, { token: outsider, body: route.body?.(ids) });
      if (res.status !== 404) leaks.push(`${route.method} ${path}: ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it("never shows a resident another resident's name", async () => {
    const juan = auth.resident.token!;
    for (const path of ["/api/requests", "/api/queue/state", "/api/queue/tickets/mine"]) {
      const body = JSON.stringify((await call(t, "GET", path, { token: juan })).body);
      expect(body).not.toContain("Residente");
    }
  });
});
