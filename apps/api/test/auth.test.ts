import { Controller, Get, UseGuards } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Roles } from "../src/auth/decorators.js";
import { JwtAuthGuard } from "../src/auth/jwt-auth.guard.js";
import { RolesGuard } from "../src/auth/roles.guard.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { KAPITAN_PASSWORD, RESIDENT_PASSWORD, seedBarangay, STAFF_PIN, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";

@Controller("test")
@UseGuards(JwtAuthGuard, RolesGuard)
class KapitanOnlyController {
  @Get("kapitan-only")
  @Roles("KAPITAN")
  ok() {
    return { ok: true };
  }
}

const cookieOf = (res: { headers: Record<string, unknown> }) => {
  const raw = res.headers["set-cookie"] as string[] | undefined;
  return raw?.find((c) => c.startsWith("__Host-bq_refresh="));
};
const tokenOf = (cookie: string | undefined) => cookie?.split(";")[0]?.split("=")[1] ?? "";
const refresh = (t: TestApp, token: string, header = true) =>
  call(t, "POST", "/api/auth/refresh", {
    headers: { cookie: `__Host-bq_refresh=${token}`, ...(header ? { "x-requested-with": "bqueue" } : {}) },
  });

describe("auth", () => {
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  const login = (username: string, secret: string, ip?: string) =>
    call(t, "POST", "/api/auth/login", { body: { username, secret }, ...(ip ? { ip } : {}) });

  beforeAll(async () => {
    t = await createTestApp({ controllers: [KapitanOnlyController] });
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set("2026-10-28T02:00:00Z");
    await resetDb(db);
    b = await seedBarangay(db, { now: t.clock.now() });
  });

  it("signs in the kapitan, staff and residents and sets the refresh cookie", async () => {
    const res = await login(b.kapitan.username, KAPITAN_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ role: "KAPITAN", displayName: "Hon. Teresa Villanueva" });
    expect(res.body.barangay).toMatchObject({ name: "Barangay Masagana" });
    const cookie = cookieOf(res)!;
    for (const part of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) expect(cookie).toContain(part);
    expect((await login(b.staff2.username, STAFF_PIN)).status).toBe(200);
    expect((await login(b.residentUser.username, RESIDENT_PASSWORD)).status).toBe(200);
  });

  it("answers a wrong secret and an unknown user the same way", async () => {
    const wrong = await login(b.kapitan.username, "nope");
    const unknown = await login("nobody.zzzz", "nope");
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe("invalid_credentials");
  });

  it("locks an account for 15 minutes after 5 wrong tries", async () => {
    for (let i = 0; i < 5; i++) await login(b.staff2.username, "000001");
    const locked = await login(b.staff2.username, STAFF_PIN);
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe("account_locked");
    expect(locked.body.error.retryAfter).toEqual(expect.any(String));
    t.clock.advance(15 * 60_000 + 1000);
    expect((await login(b.staff2.username, STAFF_PIN)).status).toBe(200);
  });

  it("ends sessions of an expired barangay", async () => {
    const ok = await login(b.kapitan.username, KAPITAN_PASSWORD);
    t.clock.advance(24 * 3600_000 + 1000);
    const again = await login(b.kapitan.username, KAPITAN_PASSWORD);
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe("session_expired");
    const res = await refresh(t, tokenOf(cookieOf(ok)));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("session_expired");
    expect(cookieOf(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("needs X-Requested-With on refresh", async () => {
    const ok = await login(b.kapitan.username, KAPITAN_PASSWORD);
    const res = await refresh(t, tokenOf(cookieOf(ok)), false);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("rotates refresh tokens and revokes the family on reuse", async () => {
    const a = tokenOf(cookieOf(await login(b.kapitan.username, KAPITAN_PASSWORD)));
    const first = await refresh(t, a);
    expect(first.status).toBe(200);
    expect(first.body.user.role).toBe("KAPITAN");
    const bToken = tokenOf(cookieOf(first));
    expect(bToken).not.toBe(a);
    const reuse = await refresh(t, a);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("unauthenticated");
    expect((await refresh(t, bToken)).status).toBe(401);
  });

  it("logs out", async () => {
    const a = tokenOf(cookieOf(await login(b.kapitan.username, KAPITAN_PASSWORD)));
    const out = await call(t, "POST", "/api/auth/logout", { headers: { cookie: `__Host-bq_refresh=${a}` } });
    expect(out.status).toBe(204);
    expect((await refresh(t, a)).status).toBe(401);
  });

  it("refuses deactivated users", async () => {
    await db.user.update({ where: { id: b.staff1.id }, data: { active: false } });
    const res = await login(b.staff1.username, STAFF_PIN);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
  });

  it("keeps the cookie when the database fails during refresh", async () => {
    const a = tokenOf(cookieOf(await login(b.kapitan.username, KAPITAN_PASSWORD)));
    const spy = vi.spyOn(db.session, "findUnique").mockRejectedValueOnce(new Error("db down"));
    const res = await refresh(t, a);
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("answers /api/me with the resident id or the counter", async () => {
    const juan = await login(b.residentUser.username, RESIDENT_PASSWORD);
    const me = await call(t, "GET", "/api/me", { token: juan.body.accessToken });
    expect(me.body).toMatchObject({ user: { role: "RESIDENT" }, residentId: b.resident.id, counterId: null });
    const ramil = await login(b.staff2.username, STAFF_PIN);
    const staffMe = await call(t, "GET", "/api/me", { token: ramil.body.accessToken });
    expect(staffMe.body.counterId).toBe(b.counters[1]!.id);
    const denied = await call(t, "GET", "/api/test/kapitan-only", { token: ramil.body.accessToken });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("forbidden");
  });

  it("limits sign-in attempts per IP", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 20; i++) await login(`someone${i}.zzzz`, "x", ip);
    const res = await login(b.kapitan.username, KAPITAN_PASSWORD, ip);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("rate_limited");
    expect(res.headers["ratelimit"]).toEqual(expect.any(String));
  });
});
