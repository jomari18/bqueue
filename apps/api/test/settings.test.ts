import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SocketHub } from "../src/common/socket-hub.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { KAPITAN_PASSWORD, RESIDENT_PASSWORD, seedBarangay, STAFF_PIN, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";
import { RecordingSocketHub } from "./support/recording-hub.js";

describe("settings", () => {
  const hub = new RecordingSocketHub();
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  let kapitan: string;
  const login = async (username: string, secret: string) => call(t, "POST", "/api/auth/login", { body: { username, secret } });
  const as = (method: "GET" | "POST" | "PATCH", path: string, body?: unknown) => call(t, method, path, { token: kapitan, body });

  beforeAll(async () => {
    t = await createTestApp({ configure: (m) => m.overrideProvider(SocketHub).useValue(hub) });
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(db);
    hub.clear();
    b = await seedBarangay(db);
    kapitan = (await login(b.kapitan.username, KAPITAN_PASSWORD)).body.accessToken;
  });

  it("changes fees for new requests only and hides inactive types", async () => {
    const juan = (await login(b.residentUser.username, RESIDENT_PASSWORD)).body.accessToken;
    const submit = (documentTypeId: string) =>
      call(t, "POST", "/api/requests", { token: juan, body: { id: randomUUID(), documentTypeId, purpose: "Employment" } });
    const before = (await submit(b.types.CLEARANCE.id)).body.request;
    expect((await as("PATCH", `/api/settings/document-types/${b.types.CLEARANCE.id}`, { feeCentavos: 15000 })).body.feeCentavos).toBe(15000);
    expect((await submit(b.types.CLEARANCE.id)).body.request.feeCentavos).toBe(15000);
    expect((await db.request.findUniqueOrThrow({ where: { id: before.id } })).feeCentavos).toBe(10000);
    await as("PATCH", `/api/settings/document-types/${b.types.RESIDENCY.id}`, { active: false });
    const listed = (await call(t, "GET", "/api/document-types", { token: juan })).body.map((x: { code: string }) => x.code);
    expect(listed).not.toContain("RESIDENCY");
    expect((await as("GET", "/api/settings/document-types")).body).toHaveLength(5);
    expect((await submit(b.types.RESIDENCY.id)).status).toBe(400);
  });

  it("adds and edits counters, up to 10", async () => {
    const added = await as("POST", "/api/settings/counters", { name: "Counter 4", lanes: ["GENERAL"] });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ name: "Counter 4", lanes: ["GENERAL"], open: false });
    const edited = await as("PATCH", `/api/settings/counters/${added.body.id}`, { name: "Window 4", lanes: ["PRIORITY", "GENERAL"] });
    expect(edited.body).toMatchObject({ name: "Window 4", lanes: ["PRIORITY", "GENERAL"] });
    for (let i = 5; i <= 10; i++) expect((await as("POST", "/api/settings/counters", { name: `C${i}`, lanes: ["GENERAL"] })).status).toBe(201);
    expect((await as("POST", "/api/settings/counters", { name: "C11", lanes: ["GENERAL"] })).body.error.code).toBe("limit_reached");
    expect((await as("GET", "/api/settings/counters")).body).toHaveLength(10);
  });

  it("adds staff, resets PINs and deactivates accounts", async () => {
    const added = await as("POST", "/api/settings/staff", { displayName: "Ate Joy", pin: "739204" });
    expect(added.status).toBe(201);
    expect(added.body.username).toBe(`staff3.${b.barangay.code}`);
    expect((await login(added.body.username, "739204")).status).toBe(200);
    await as("PATCH", `/api/settings/staff/${added.body.id}`, { pin: "591846" });
    expect((await login(added.body.username, "739204")).status).toBe(401);
    expect((await login(added.body.username, "591846")).status).toBe(200);

    const ramil = await login(b.staff2.username, STAFF_PIN);
    const cookie = (ramil.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
    const off = await as("PATCH", `/api/settings/staff/${b.staff2.id}`, { active: false });
    expect(off.body).toMatchObject({ active: false, counterName: null });
    expect((await login(b.staff2.username, STAFF_PIN)).status).toBe(401);
    expect((await call(t, "POST", "/api/auth/refresh", { headers: { cookie, "x-requested-with": "bqueue" } })).status).toBe(401);
    expect((await db.counter.findUniqueOrThrow({ where: { id: b.counters[1]!.id } })).staffId).toBeNull();
    const list = (await as("GET", "/api/settings/staff")).body;
    expect(list.map((s: { displayName: string }) => s.displayName)).toEqual(["Ate Liza", "Kuya Ramil", "Ate Joy"]);
  });

  it("rotates display keys and disconnects the old screens", async () => {
    const res = await as("POST", "/api/settings/keys/display/rotate");
    expect(res.status).toBe(201);
    expect(res.body.link).toMatch(/^https:\/\/bqueue\.test\/display#[A-Za-z0-9_-]{43}$/);
    const fresh = res.body.link.split("#")[1];
    expect((await call(t, "GET", "/api/queue/state", { headers: { "x-display-key": b.keys.display } })).status).toBe(401);
    expect((await call(t, "GET", "/api/queue/state", { headers: { "x-display-key": fresh } })).status).toBe(200);
    expect(hub.disconnected).toEqual([{ room: `b:${b.barangay.id}:public`, kind: "display" }]);
  });

  it("turns the simulator off", async () => {
    const res = await as("PATCH", "/api/settings/simulator", { on: false });
    expect(res.body.simulatorOn).toBe(false);
  });

  it("is for the kapitan only", async () => {
    const staff = (await login(b.staff1.username, STAFF_PIN)).body.accessToken;
    for (const path of ["/api/settings/document-types", "/api/settings/counters", "/api/settings/staff"]) {
      expect((await call(t, "GET", path, { token: staff })).status).toBe(403);
    }
    expect((await call(t, "PATCH", "/api/settings/simulator", { token: staff, body: { on: false } })).status).toBe(403);
  });
});
