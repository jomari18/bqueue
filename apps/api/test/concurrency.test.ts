import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { addCounters, KAPITAN_PASSWORD, seedBarangay, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";
import { insertTicket } from "./support/tickets.js";

describe("call next under concurrency (spec 1.3, criterion 3)", () => {
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  let kapitan: string;

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(db);
    b = await seedBarangay(db);
    kapitan = (await call(t, "POST", "/api/auth/login", { body: { username: b.kapitan.username, secret: KAPITAN_PASSWORD } })).body
      .accessToken;
    for (let i = 1; i <= 30; i++) {
      await insertTicket(db, b.barangay.id, { lane: "GENERAL", number: i, queuedAt: new Date(Date.parse("2026-10-28T01:00:00Z") + i * 1000) });
    }
  });

  it("gives 20 counters 20 different tickets", async () => {
    const counters = await addCounters(db, b.barangay.id, 20);
    const answers = await Promise.all(counters.map((c) => call(t, "POST", `/api/counters/${c.id}/call-next`, { token: kapitan })));
    expect(answers.map((a) => a.status)).toEqual(Array(20).fill(200));
    const ids = answers.map((a) => a.body.ticket.id as string);
    expect(new Set(ids).size).toBe(20);
    const called = await db.queueTicket.findMany({ where: { status: "CALLED" } });
    expect(called).toHaveLength(20);
    expect(new Set(called.map((c) => c.counterId)).size).toBe(20);
  });

  it("never gives one counter two tickets", async () => {
    const counter = b.counters[1]!.id;
    const answers = await Promise.all([1, 2].map(() => call(t, "POST", `/api/counters/${counter}/call-next`, { token: kapitan })));
    expect(answers.map((a) => a.status).sort()).toEqual([200, 409]);
    expect(answers.find((a) => a.status === 409)!.body.error.code).toBe("counter_busy");
    expect(await db.queueTicket.count({ where: { status: "CALLED" } })).toBe(1);
  });
});
