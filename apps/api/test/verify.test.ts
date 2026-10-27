import { randomUUID } from "node:crypto";
import { formatVerificationCode } from "@bq/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { KAPITAN_PASSWORD, RESIDENT_PASSWORD, seedBarangay, STAFF_PIN, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";

describe("verification and printable documents", () => {
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  let juan: string;
  let staff: string;
  let kapitan: string;
  let id: string;
  let code: string;
  const login = async (username: string, secret: string) =>
    (await call(t, "POST", "/api/auth/login", { body: { username, secret } })).body.accessToken as string;
  const verify = (c: string, ip?: string) => call(t, "GET", `/api/verify/${encodeURIComponent(c)}`, ip ? { ip } : {});

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
    kapitan = await login(b.kapitan.username, KAPITAN_PASSWORD);
    id = (await call(t, "POST", "/api/requests", { token: juan, body: { id: randomUUID(), documentTypeId: b.types.CLEARANCE.id, purpose: "Employment" } })).body.request.id;
    await call(t, "POST", `/api/requests/${id}/forward`, { token: staff });
    await call(t, "POST", `/api/requests/${id}/approve`, { token: kapitan });
    code = (await call(t, "POST", `/api/requests/${id}/release`, { token: staff, body: { idChecked: true, orNumber: "OR-5555" } })).body.verificationCode;
  });

  it("shows only the public facts of a valid document", async () => {
    const res = await verify(code);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["barangay", "documentName", "fullName", "issuedAt", "status", "validUntil"]);
    expect(res.body).toMatchObject({
      status: "VALID",
      documentName: { en: "Barangay Clearance", fil: "Barangay Clearance" },
      fullName: "Juan Dela Cruz",
      barangay: { name: "Barangay Masagana", city: "Lungsod ng Kalayaan" },
    });
  });

  it("accepts codes the way people type them", async () => {
    for (const typed of [code.toLowerCase(), formatVerificationCode(code), `${code.slice(0, 5)} ${code.slice(5)}`]) {
      expect((await verify(typed)).status).toBe(200);
    }
    await db.request.update({ where: { id }, data: { verificationCode: "10ABCDEFGH" } });
    expect((await verify("lOabcdefgh")).body.status).toBe("VALID");
  });

  it("says expired, revoked or not found", async () => {
    t.clock.advance(181 * 86_400_000);
    expect((await verify(code)).body.status).toBe("EXPIRED");
    t.clock.set("2026-10-28T02:05:00Z");
    await call(t, "POST", `/api/requests/${id}/revoke`, { token: kapitan, body: { reason: "Issued by mistake" } });
    expect((await verify(code)).body.status).toBe("REVOKED");
    expect((await verify("ZZZZZZZZZZ")).body.error.code).toBe("not_found");
    expect((await verify("xyz")).status).toBe(404);
  });

  it("is rate limited and still needs the proxy signature", async () => {
    for (let i = 0; i < 30; i++) await verify(code, "10.7.7.7");
    expect((await verify(code, "10.7.7.7")).status).toBe(429);
    expect((await request(t.http).get(`/api/verify/${code}`)).status).toBe(403);
  });

  it("gives the printable document data to the owner, staff and the kapitan", async () => {
    for (const token of [juan, staff, kapitan]) {
      const res = await call(t, "GET", `/api/requests/${id}/document`, { token });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        kapitan: { displayName: "Hon. Teresa Villanueva" },
        barangay: { name: "Barangay Masagana" },
        resident: { fullName: "Juan Dela Cruz", purok: 3 },
        request: { verificationCode: code },
      });
      expect(res.body.approvedAt).toEqual(expect.any(String));
      expect(res.body.releasedAt).toEqual(expect.any(String));
    }
    const pending = (await call(t, "POST", "/api/requests", { token: juan, body: { id: randomUUID(), documentTypeId: b.types.INDIGENCY.id, purpose: "School" } })).body.request.id;
    expect((await call(t, "GET", `/api/requests/${pending}/document`, { token: juan })).status).toBe(409);
    const other = await db.user.create({
      data: { barangayId: b.barangay.id, role: "RESIDENT", username: `maria.${b.barangay.code}`, displayName: "Maria", secretHash: b.residentUser.secretHash, secretKind: "PASSWORD" },
    });
    await db.resident.update({ where: { id: b.residents[0]!.id }, data: { userId: other.id } });
    const maria = await login(other.username, RESIDENT_PASSWORD);
    expect((await call(t, "GET", `/api/requests/${id}/document`, { token: maria })).status).toBe(404);
  });
});
