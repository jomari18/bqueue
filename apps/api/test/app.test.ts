import { Controller, Get } from "@nestjs/common";
import { ERROR_MESSAGES } from "@bq/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/config.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { testEnv } from "./support/env.js";
import { call } from "./support/http.js";
import { signNetlify } from "./support/signing.js";

@Controller("test")
class BoomController {
  @Get("boom")
  boom(): never {
    throw new Error("kaboom");
  }
}

describe("API skeleton", () => {
  const logLines: Record<string, unknown>[] = [];
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ controllers: [BoomController], logLines });
  });
  afterAll(() => t.close());

  it("answers health directly, with CORS for the site only", async () => {
    const health = await request(t.http).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ ok: true });
    expect(health.headers["access-control-allow-origin"]).toBe("https://bqueue.test");
  });

  it("refuses requests that did not come through the signed proxy", async () => {
    const unsigned = await request(t.http).get("/api/me");
    expect(unsigned.status).toBe(403);
    expect(unsigned.body.error.code).toBe("bad_proxy_signature");
    const forged = await request(t.http).get("/api/me").set("x-nf-sign", await signNetlify("wrong-secret-".repeat(3)));
    expect(forged.status).toBe(403);
  });

  it("answers errors in the spec format, in the visitor's language", async () => {
    const signed = await call(t, "GET", "/api/me");
    expect(signed.status).toBe(401);
    expect(signed.body).toEqual({ error: { code: "unauthenticated", message: ERROR_MESSAGES.unauthenticated.en } });
    const fil = await call(t, "GET", "/api/me", { headers: { "accept-language": "fil-PH,fil;q=0.9" } });
    expect(fil.body.error.message).toBe(ERROR_MESSAGES.unauthenticated.fil);
  });

  it("refuses bodies over 32 KB, unknown routes and hides crashes", async () => {
    const big = await call(t, "POST", "/api/auth/login", { body: { username: "x".repeat(40_000) } });
    expect(big.status).toBe(400);
    expect(big.body.error.code).toBe("invalid_input");
    expect((await call(t, "GET", "/api/nope")).body.error.code).toBe("not_found");
    const boom = await call(t, "GET", "/api/test/boom");
    expect(boom.status).toBe(503);
    expect(boom.body.error.code).toBe("service_unavailable");
  });

  it("logs only method, path, status and time", () => {
    expect(logLines.find((l) => l.path === "/api/me" && l.status === 401)).toEqual(
      expect.objectContaining({ method: "GET", ms: expect.any(Number) }),
    );
    expect(Object.keys(logLines.find((l) => l.path === "/api/me") ?? {}).sort()).toEqual(
      ["hostname", "level", "method", "ms", "path", "pid", "status", "time"],
    );
    expect(JSON.stringify(logLines)).not.toContain("x-nf-sign");
  });

  it("refuses short secrets", () => {
    expect(() => loadConfig({ ...testEnv, SOCKET_TICKET_SECRET: "short" })).toThrow();
  });
});
