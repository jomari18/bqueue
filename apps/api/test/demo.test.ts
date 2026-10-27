import { PinSchema } from "@bq/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { seedBarangay } from "./support/factories.js";
import { call } from "./support/http.js";

describe("demo barangays", () => {
  let t: TestApp;
  let db: PrismaService;
  const demo = (ip = "10.1.1.1") => call(t, "POST", "/api/demo", { ip });
  const hashOf = (link: string) => link.split("#")[1]!;

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set("2026-10-28T04:30:00Z");
    await resetDb(db);
  });

  it("creates a seeded barangay and signs the visitor in as Kuya Ramil", async () => {
    const started = performance.now();
    const res = await demo();
    console.log(`demo creation took ${Math.round(performance.now() - started)} ms`);
    expect(res.status).toBe(201);
    const body = res.body;
    expect(body.user).toMatchObject({ displayName: "Kuya Ramil", role: "STAFF" });
    expect(body.barangay).toMatchObject({ name: "Barangay Masagana", city: "Lungsod ng Kalayaan" });
    expect(body.expiresAt).toBe("2026-10-29T04:30:00.000Z");
    expect(body.demoLogins.kapitan.username).toMatch(/^kapitan\.[a-z2-9]{4}$/);
    expect(body.demoLogins.staff.username).toMatch(/^staff2\.[a-z2-9]{4}$/);
    expect(body.demoLogins.resident.username).toMatch(/^juan\.[a-z2-9]{4}$/);
    expect(body.demoLogins.kapitan.password).toHaveLength(16);
    expect(body.demoLogins.resident.password).toHaveLength(16);
    expect(PinSchema.safeParse(body.demoLogins.staff.pin).success).toBe(true);
    expect(body.displayLink).toMatch(/^https:\/\/bqueue\.test\/display#[A-Za-z0-9_-]{43}$/);
    expect(body.kioskLink).toMatch(/^https:\/\/bqueue\.test\/kiosk#[A-Za-z0-9_-]{43}$/);
    expect(body.joinLink).toMatch(/^https:\/\/bqueue\.test\/join#[A-Za-z0-9_-]{22}$/);
    expect(body.joinExpiresAt).toBe("2026-10-28T04:40:00.000Z");
    expect(res.headers["set-cookie"]?.[0]).toContain("__Host-bq_refresh=");

    const l = body.demoLogins;
    for (const [username, secret] of [
      [l.kapitan.username, l.kapitan.password],
      [l.staff.username, l.staff.pin],
      [l.resident.username, l.resident.password],
    ]) {
      expect((await call(t, "POST", "/api/auth/login", { body: { username, secret } })).status).toBe(200);
    }

    expect(await db.resident.count()).toBe(41);
    expect(await db.counter.count()).toBe(3);
    expect(await db.documentType.count()).toBe(5);
    expect(await db.queueTicket.count()).toBeGreaterThan(30 * 25);
    expect(await db.request.count()).toBeGreaterThan(30);
    const quotas = await db.demoQuota.findMany();
    expect(JSON.stringify(quotas)).not.toContain("10.1.1.1");
  });

  it("allows 5 demo barangays per IP per Manila day", async () => {
    for (let i = 0; i < 5; i++) expect((await demo("10.2.2.2")).status).toBe(201);
    const sixth = await demo("10.2.2.2");
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("demo_limit");
    expect(sixth.body.error.retryAfter).toBe("2026-10-28T16:00:00.000Z");
    t.clock.set("2026-10-28T16:00:01Z");
    expect((await demo("10.2.2.2")).status).toBe(201);
  });

  it("refuses new demos when 200 are active", async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      code: `z${String(i).padStart(3, "0")}`,
      name: "x",
      city: "x",
      displayKeyHash: `d${String(i).padStart(63, "0")}`,
      kioskKeyHash: `k${String(i).padStart(63, "0")}`,
      expiresAt: new Date("2026-10-29T00:00:00Z"),
    }));
    await db.barangay.createMany({ data: rows });
    const res = await demo();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("demo_full");
  });

  it("deletes expired barangays when a new one is created", async () => {
    const old = await seedBarangay(db, { now: new Date("2026-10-26T00:00:00Z"), expiresAt: new Date("2026-10-27T00:00:00Z") });
    expect((await demo()).status).toBe(201);
    expect(await db.barangay.findUnique({ where: { id: old.barangay.id } })).toBeNull();
  });

  it("signs a phone in as Juan with a single-use, 10-minute join code", async () => {
    const created = (await demo()).body;
    const join = (code: string) => call(t, "POST", "/api/demo/join", { body: { code } });
    const first = await join(hashOf(created.joinLink));
    expect(first.status).toBe(200);
    expect(first.body.user).toMatchObject({ role: "RESIDENT", displayName: "Juan Dela Cruz" });
    expect(first.headers["set-cookie"]?.[0]).toContain("__Host-bq_refresh=");
    expect((await join(hashOf(created.joinLink))).body.error.code).toBe("invalid_credentials");

    const fresh = await call(t, "POST", "/api/demo/join-code", { token: created.accessToken });
    expect(fresh.status).toBe(201);
    const second = (await call(t, "POST", "/api/demo/join-code", { token: created.accessToken })).body;
    expect((await join(hashOf(fresh.body.joinLink))).status).toBe(401); // replaced by the newer code
    t.clock.advance(10 * 60_000 + 1000);
    expect((await join(hashOf(second.joinLink))).status).toBe(401); // expired
  });

  it("limits join attempts per IP", async () => {
    const code = "A".repeat(22);
    for (let i = 0; i < 10; i++) await call(t, "POST", "/api/demo/join", { body: { code }, ip: "10.3.3.3" });
    const res = await call(t, "POST", "/api/demo/join", { body: { code }, ip: "10.3.3.3" });
    expect(res.status).toBe(429);
  });

  it("cleans up expired barangays with the secret", async () => {
    await seedBarangay(db, { now: new Date("2026-10-26T00:00:00Z"), expiresAt: new Date("2026-10-27T00:00:00Z") });
    const wrong = await call(t, "POST", "/api/admin/cleanup", { headers: { "x-cleanup-secret": "nope" } });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe("forbidden");
    const ok = await call(t, "POST", "/api/admin/cleanup", { headers: { "x-cleanup-secret": "test-cleanup-secret-0123456789abcdef" } });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ deleted: 1 });
  });
});
