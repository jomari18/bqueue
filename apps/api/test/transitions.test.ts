import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SocketHub } from "../src/common/socket-hub.js";
import { CODE_GENERATOR } from "../src/documents/verification.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { KAPITAN_PASSWORD, RESIDENT_PASSWORD, seedBarangay, STAFF_PIN, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";
import { RecordingSocketHub } from "./support/recording-hub.js";

const queuedCodes: string[] = [];
const codes = {
  next: () => queuedCodes.shift() ?? Array.from({ length: 10 }, () => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[Math.floor(Math.random() * 32)]).join(""),
};

describe("request transitions", () => {
  const hub = new RecordingSocketHub();
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  let juan: string;
  let staff: string;
  let kapitan: string;
  const login = async (username: string, secret: string) =>
    (await call(t, "POST", "/api/auth/login", { body: { username, secret } })).body.accessToken as string;
  const act = (token: string, id: string, action: string, body?: unknown) =>
    call(t, "POST", `/api/requests/${id}/${action}`, { token, body });
  const submit = async (code: "CLEARANCE" | "INDIGENCY" = "CLEARANCE") =>
    (await call(t, "POST", "/api/requests", { token: juan, body: { id: randomUUID(), documentTypeId: b.types[code].id, purpose: "Employment" } }))
      .body.request.id as string;
  const ready = async (code: "CLEARANCE" | "INDIGENCY" = "CLEARANCE") => {
    const id = await submit(code);
    await act(staff, id, "forward");
    await act(kapitan, id, "approve");
    return id;
  };

  beforeAll(async () => {
    t = await createTestApp({
      configure: (m) => m.overrideProvider(SocketHub).useValue(hub).overrideProvider(CODE_GENERATOR).useValue(codes),
    });
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(db);
    hub.clear();
    b = await seedBarangay(db);
    juan = await login(b.residentUser.username, RESIDENT_PASSWORD);
    staff = await login(b.staff2.username, STAFF_PIN);
    kapitan = await login(b.kapitan.username, KAPITAN_PASSWORD);
  });

  it("follows the full path with an event for every move", async () => {
    const id = await submit();
    expect((await act(staff, id, "forward")).body.status).toBe("FOR_APPROVAL");
    const approved = await act(kapitan, id, "approve");
    expect(approved.body.status).toBe("READY_FOR_PICKUP");
    const released = await act(staff, id, "release", { idChecked: true, orNumber: "OR-123456" });
    expect(released.status).toBe(200);
    expect(released.body).toMatchObject({ status: "RELEASED", orNumber: "OR-123456" });
    expect(released.body.verificationCode).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    const row = await db.request.findUniqueOrThrow({ where: { id } });
    expect(row.approvedById).toBe(b.kapitan.id);
    expect(row.approvedAt).toEqual(t.clock.now());
    expect(row.releasedById).toBe(b.staff2.id);
    expect(row.validUntil!.getTime() - row.releasedAt!.getTime()).toBe(180 * 86_400_000);
    const revoked = await act(kapitan, id, "revoke", { reason: "Issued by mistake" });
    expect(revoked.body).toMatchObject({ status: "RELEASED", revokeReason: "Issued by mistake" });
    expect(revoked.body.revokedAt).toEqual(expect.any(String));
    const events = await db.requestEvent.findMany({ where: { requestId: id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.actorId)).toEqual([b.residentUser.id, b.staff2.id, b.kapitan.id, b.staff2.id, b.kapitan.id]);
    expect(events.at(-1)).toMatchObject({ fromStatus: "RELEASED", toStatus: "RELEASED", note: "Issued by mistake" });
    const updates = hub.emitted.filter((e) => e.event === "request:updated").map((e) => e.room);
    expect(updates).toContain(`u:${b.residentUser.id}`);
    expect(updates.filter((r) => r === `b:${b.barangay.id}:staff`)).toHaveLength(4);
  });

  it("releases free documents without an OR number", async () => {
    const id = await ready("INDIGENCY");
    const res = await act(staff, id, "release", { idChecked: true, orNumber: "OR-1234" });
    expect(res.body).toMatchObject({ status: "RELEASED", orNumber: null });
  });

  it("checks the release input", async () => {
    const id = await ready();
    const noOr = await act(staff, id, "release", { idChecked: true });
    expect(noOr.status).toBe(400);
    expect(noOr.body.error.field).toBe("orNumber");
    expect((await act(staff, id, "release", { orNumber: "OR-1234" })).status).toBe(400);
  });

  it("rejects with a reason, from the right role", async () => {
    const id = await submit();
    const noReason = await act(staff, id, "reject", {});
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.field).toBe("reason");
    await act(staff, id, "forward");
    expect((await act(staff, id, "reject", { reason: "Incomplete details" })).status).toBe(403);
    const res = await act(kapitan, id, "reject", { reason: "Incomplete details" });
    expect(res.body).toMatchObject({ status: "REJECTED", rejectReason: "Incomplete details" });
  });

  it("refuses moves that are not allowed", async () => {
    const id = await ready();
    expect((await act(kapitan, id, "approve")).body.error.code).toBe("invalid_transition");
    const fresh = await submit();
    expect((await act(juan, fresh, "forward")).status).toBe(403);
    expect((await act(staff, fresh, "approve")).status).toBe(403);
    await act(staff, id, "release", { idChecked: true, orNumber: "OR-1234" });
    await act(kapitan, id, "revoke", { reason: "Issued by mistake" });
    expect((await act(kapitan, id, "revoke", { reason: "Again" })).body.error.code).toBe("invalid_transition");
  });

  it("retries a verification code that is already taken", async () => {
    const first = await ready();
    queuedCodes.push("ABCDEFGHJK");
    await act(staff, first, "release", { idChecked: true, orNumber: "OR-1111" });
    const second = await ready();
    queuedCodes.push("ABCDEFGHJK", "ZZZZZ00000");
    const res = await act(staff, second, "release", { idChecked: true, orNumber: "OR-2222" });
    expect(res.status).toBe(200);
    expect(res.body.verificationCode).toBe("ZZZZZ00000");
  });

  it("keeps the invariants after a mixed run", async () => {
    await ready();
    const released = await ready();
    await act(staff, released, "release", { idChecked: true, orNumber: "OR-3333" });
    const rejected = await submit();
    await act(staff, rejected, "reject", { reason: "Wrong type" });
    const mismatched = await db.$queryRaw<{ bad: bigint }[]>`
      SELECT count(*) AS bad FROM "Request" WHERE (status = 'RELEASED') <> ("verificationCode" IS NOT NULL)`;
    expect(Number(mismatched[0]!.bad)).toBe(0);
    const counts = await db.request.findMany({ include: { _count: { select: { events: true } } } });
    const expected: Record<string, number> = { READY_FOR_PICKUP: 3, RELEASED: 4, REJECTED: 2 };
    for (const r of counts) expect(r._count.events).toBe(expected[r.status]);
  });
});
