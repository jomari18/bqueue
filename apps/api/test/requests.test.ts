import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SocketHub } from "../src/common/socket-hub.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { KAPITAN_PASSWORD, RESIDENT_PASSWORD, seedBarangay, STAFF_PIN, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";
import { RecordingSocketHub } from "./support/recording-hub.js";

describe("requests", () => {
  const hub = new RecordingSocketHub();
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  let juan: string;
  let staff: string;
  const login = async (username: string, secret: string) =>
    (await call(t, "POST", "/api/auth/login", { body: { username, secret } })).body.accessToken as string;
  const submit = (token: string, body: Record<string, unknown>) => call(t, "POST", "/api/requests", { token, body });
  const clearance = () => ({ id: randomUUID(), documentTypeId: b.types.CLEARANCE.id, purpose: "Employment" });

  beforeAll(async () => {
    t = await createTestApp({ configure: (m) => m.overrideProvider(SocketHub).useValue(hub) });
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(db);
    hub.clear();
    b = await seedBarangay(db);
    juan = await login(b.residentUser.username, RESIDENT_PASSWORD);
    staff = await login(b.staff2.username, STAFF_PIN);
  });

  it("lists the active document types in both languages", async () => {
    const res = await call(t, "GET", "/api/document-types", { token: juan });
    expect(res.body.map((d: { code: string }) => d.code)).toEqual(["CLEARANCE", "RESIDENCY", "INDIGENCY", "BUSINESS", "BRGY_ID"]);
    expect(res.body[2]).toMatchObject({ nameEn: "Certificate of Indigency", nameFil: "Sertipiko ng Kahirapan", feeCentavos: 0 });
  });

  it("submits a request once per client id", async () => {
    const input = clearance();
    const first = await submit(juan, input);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ duplicate: false, request: { status: "SUBMITTED", feeCentavos: 10000 } });
    const again = await submit(juan, input);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(await db.requestEvent.count()).toBe(1);
    const event = await db.requestEvent.findFirstOrThrow();
    expect(event).toMatchObject({ fromStatus: null, toStatus: "SUBMITTED", actorId: b.residentUser.id });
    expect(hub.emitted.filter((e) => e.event === "request:created")).toEqual([
      expect.objectContaining({ room: `b:${b.barangay.id}:staff` }),
    ]);
    // Another resident reusing the id is refused.
    const other = await db.user.create({
      data: { barangayId: b.barangay.id, role: "RESIDENT", username: `maria.${b.barangay.code}`, displayName: "Maria", secretHash: b.residentUser.secretHash, secretKind: "PASSWORD" },
    });
    await db.resident.update({ where: { id: b.residents[1]!.id }, data: { userId: other.id } });
    const maria = await login(other.username, RESIDENT_PASSWORD);
    const stolen = await submit(maria, input);
    expect(stolen.status).toBe(400);
    expect(stolen.body.error.field).toBe("id");
  });

  it("checks the document type and the business name", async () => {
    const business = await submit(juan, { id: randomUUID(), documentTypeId: b.types.BUSINESS.id, purpose: "New store" });
    expect(business.status).toBe(400);
    expect(business.body.error.field).toBe("businessName");
    await db.documentType.update({ where: { id: b.types.RESIDENCY.id }, data: { active: false } });
    for (const documentTypeId of [b.types.RESIDENCY.id, randomUUID()]) {
      const res = await submit(juan, { ...clearance(), documentTypeId });
      expect(res.status).toBe(400);
      expect(res.body.error.field).toBe("documentTypeId");
    }
  });

  it("caps open requests per resident and per barangay", async () => {
    for (let i = 0; i < 3; i++) expect((await submit(juan, clearance())).status).toBe(201);
    const fourth = await submit(juan, clearance());
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe("limit_reached");
    await db.request.updateMany({ data: { status: "CANCELLED" } });
    await db.request.createMany({
      data: Array.from({ length: 297 }, () => ({
        id: randomUUID(),
        barangayId: b.barangay.id,
        residentId: b.residents[0]!.id,
        documentTypeId: b.types.CLEARANCE.id,
        purpose: "x",
        status: "CANCELLED" as const,
        feeCentavos: 0,
      })),
    });
    expect((await submit(juan, clearance())).body.error.code).toBe("limit_reached");
  });

  it("shows residents their own requests and staff the board", async () => {
    const mine = (await submit(juan, clearance())).body.request.id;
    await db.request.create({
      data: { id: randomUUID(), barangayId: b.barangay.id, residentId: b.residents[0]!.id, documentTypeId: b.types.CLEARANCE.id, purpose: "x", status: "SUBMITTED", feeCentavos: 0, createdAt: new Date("2026-10-28T01:00:00Z") },
    });
    const list = await call(t, "GET", "/api/requests", { token: juan });
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([mine]);
    const board = await call(t, "GET", "/api/requests?status=SUBMITTED", { token: staff });
    expect(board.body).toHaveLength(2);
    expect(board.body[1].id).toBe(mine); // oldest first
    const one = await call(t, "GET", `/api/requests/${mine}`, { token: staff });
    expect(one.body.events).toHaveLength(1);
    const otherBarangay = await seedBarangay(db);
    const outsider = await login(otherBarangay.kapitan.username, KAPITAN_PASSWORD);
    expect((await call(t, "GET", `/api/requests/${mine}`, { token: outsider })).status).toBe(404);
  });

  it("lets only the owner cancel a submitted request", async () => {
    const id = (await submit(juan, clearance())).body.request.id;
    expect((await call(t, "POST", `/api/requests/${id}/cancel`, { token: staff })).status).toBe(403);
    hub.clear();
    const res = await call(t, "POST", `/api/requests/${id}/cancel`, { token: juan });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
    expect(await db.requestEvent.count({ where: { requestId: id } })).toBe(2);
    const rooms = hub.emitted.filter((e) => e.event === "request:updated").map((e) => e.room);
    expect(rooms).toEqual([`b:${b.barangay.id}:staff`, `u:${b.residentUser.id}`]);
    const second = (await submit(juan, clearance())).body.request.id;
    await db.request.update({ where: { id: second }, data: { status: "FOR_APPROVAL" } });
    const late = await call(t, "POST", `/api/requests/${second}/cancel`, { token: juan });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("invalid_transition");
  });
});
