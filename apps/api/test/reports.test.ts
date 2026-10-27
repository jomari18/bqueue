import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { KAPITAN_PASSWORD, seedBarangay, STAFF_PIN, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";
import { insertTicket } from "./support/tickets.js";

const d = (iso: string) => new Date(iso);

describe("reports", () => {
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  let kapitan: string;
  const summary = async (range: string) => (await call(t, "GET", `/api/reports/summary?range=${range}`, { token: kapitan })).body;

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set("2026-10-28T04:00:00Z"); // noon in Manila
    await resetDb(db);
    b = await seedBarangay(db);
    kapitan = (await call(t, "POST", "/api/auth/login", { body: { username: b.kapitan.username, secret: KAPITAN_PASSWORD } })).body.accessToken;

    const ticket = (day: string, lane: "PRIORITY" | "DOCUMENTS" | "GENERAL", number: number, status: "SERVED" | "MISSED" | "WAITING", q: string, c?: string, s?: string) =>
      insertTicket(db, b.barangay.id, { day, lane, number, status, queuedAt: d(q), calledAt: c ? d(c) : null, servedAt: s ? d(s) : null });
    await ticket("2026-10-28", "GENERAL", 1, "SERVED", "2026-10-28T01:00:00Z", "2026-10-28T01:10:00Z", "2026-10-28T01:15:00Z");
    await ticket("2026-10-28", "GENERAL", 2, "MISSED", "2026-10-28T01:05:00Z", "2026-10-28T01:20:00Z");
    await ticket("2026-10-28", "DOCUMENTS", 1, "WAITING", "2026-10-27T16:30:00Z"); // 00:30 on 28 October in Manila
    await ticket("2026-10-25", "GENERAL", 1, "SERVED", "2026-10-25T01:00:00Z", "2026-10-25T01:05:00Z", "2026-10-25T01:07:00Z");
    await ticket("2026-10-10", "PRIORITY", 1, "SERVED", "2026-10-10T01:00:00Z", "2026-10-10T01:01:00Z", "2026-10-10T01:02:00Z");

    const request = async (type: "CLEARANCE" | "INDIGENCY" | "BRGY_ID", data: Record<string, unknown>, readyAt?: string) => {
      const id = randomUUID();
      await db.request.create({
        data: { id, barangayId: b.barangay.id, residentId: b.resident.id, documentTypeId: b.types[type].id, purpose: "x", feeCentavos: b.types[type].feeCentavos, status: "SUBMITTED", ...data },
      });
      if (readyAt) await db.requestEvent.create({ data: { requestId: id, fromStatus: "FOR_APPROVAL", toStatus: "READY_FOR_PICKUP", createdAt: d(readyAt) } });
    };
    await request(
      "CLEARANCE",
      { status: "RELEASED", createdAt: d("2026-10-27T17:00:00Z"), releasedAt: d("2026-10-28T03:00:00Z"), verificationCode: "AAAAA00001", validUntil: d("2027-04-26T03:00:00Z") },
      "2026-10-28T02:00:00Z",
    );
    await request("INDIGENCY", { createdAt: d("2026-10-25T02:00:00Z") });
    await request("BRGY_ID", {
      status: "RELEASED",
      createdAt: d("2026-10-26T01:00:00Z"),
      releasedAt: d("2026-10-26T03:00:00Z"),
      revokedAt: d("2026-10-26T05:00:00Z"),
      verificationCode: "AAAAA00002",
      validUntil: d("2027-10-26T03:00:00Z"),
    });
  });

  it("summarizes today", async () => {
    const s = await summary("today");
    expect(s).toMatchObject({ range: "today", from: "2026-10-28", to: "2026-10-28" });
    expect(s.requests).toEqual({
      byTypeStatus: [{ code: "CLEARANCE", status: "RELEASED", count: 1 }],
      avgDaysToReady: 0.4,
      released: 1,
      feesCollectedCentavos: 10000,
    });
    const general = s.queue.lanes.find((l: { lane: string }) => l.lane === "GENERAL");
    expect(general).toEqual({ lane: "GENERAL", tickets: 2, avgWaitSeconds: 750, avgServiceSeconds: 300, noShowRate: 0.5 });
    expect(s.queue.lanes.find((l: { lane: string }) => l.lane === "PRIORITY")).toEqual({
      lane: "PRIORITY",
      tickets: 0,
      avgWaitSeconds: null,
      avgServiceSeconds: null,
      noShowRate: null,
    });
    expect(s.queue.byHour).toHaveLength(24);
    expect(s.queue.byHour[9]).toBe(2);
    expect(s.queue.byHour[0]).toBe(1);
  });

  it("summarizes the last 7 and 30 days by Manila day", async () => {
    const week = await summary("7d");
    expect(week.from).toBe("2026-10-22");
    expect(week.requests.released).toBe(2);
    expect(week.requests.feesCollectedCentavos).toBe(10000); // the revoked ID is not counted
    expect(week.queue.lanes.find((l: { lane: string }) => l.lane === "GENERAL")).toEqual({
      lane: "GENERAL",
      tickets: 3,
      avgWaitSeconds: 600,
      avgServiceSeconds: 210,
      noShowRate: 0.33,
    });
    const month = await summary("30d");
    expect(month.from).toBe("2026-09-29");
    expect(month.queue.lanes.find((l: { lane: string }) => l.lane === "PRIORITY").tickets).toBe(1);
  });

  it("is for the kapitan only", async () => {
    const staff = (await call(t, "POST", "/api/auth/login", { body: { username: b.staff2.username, secret: STAFF_PIN } })).body.accessToken;
    expect((await call(t, "GET", "/api/reports/summary", { token: staff })).status).toBe(403);
  });
});
