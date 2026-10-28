import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { resetDb } from "./support/db.js";
import { seedBarangay, type TestBarangay } from "./support/factories.js";
import { call } from "./support/http.js";

describe("kiosk tickets", () => {
  let t: TestApp;
  let db: PrismaService;
  let b: TestBarangay;
  const kiosk = (key: string, header = "x-kiosk-key") =>
    call(t, "POST", "/api/kiosk/tickets", { headers: { [header]: key }, body: { id: randomUUID(), lane: "DOCUMENTS" } });

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(db);
    b = await seedBarangay(db);
  });

  it("issues a walk-in ticket with its tracking token", async () => {
    const res = await kiosk(b.keys.kiosk);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ duplicate: false, ticket: { code: "D-001", source: "KIOSK" } });
    expect(res.body.trackingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("refuses the display key", async () => {
    expect((await kiosk(b.keys.display, "x-display-key")).status).toBe(401);
    expect((await kiosk(b.keys.display)).status).toBe(401);
  });

  it("allows 10 tickets a minute per kiosk key", async () => {
    for (let i = 0; i < 10; i++) expect((await kiosk(b.keys.kiosk)).status).toBe(201);
    const res = await kiosk(b.keys.kiosk);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("rate_limited");
  });
});
