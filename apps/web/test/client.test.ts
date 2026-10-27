import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/lib/api/client";
import { clearSession, getSession, getStatus, refreshSession, setSession } from "../src/lib/auth/session";
import { apiError, header, mockFetch, session } from "./support/fetch";

describe("API client", () => {
  beforeEach(() => {
    clearSession("signed-out");
    setSession(session("STAFF", "old-token"));
    document.cookie = "NEXT_LOCALE=en; Path=/";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("refreshes once on a 401 and retries with the new token", async () => {
    const { calls } = mockFetch((url, init) => {
      if (url === "/api/auth/refresh") return { status: 200, body: session("STAFF", "new-token") };
      return header(init, "authorization") === "Bearer new-token" ? { status: 200, body: { ok: 1 } } : { status: 401, body: apiError("unauthenticated") };
    });
    expect(await api("/api/me")).toEqual({ ok: 1 });
    expect(calls.map((c) => c.url)).toEqual(["/api/me", "/api/auth/refresh", "/api/me"]);
    expect(header(calls[1]!.init, "x-requested-with")).toBe("bqueue");
  });

  it("does not refresh for a wrong login", async () => {
    const { calls } = mockFetch(() => ({ status: 401, body: apiError("invalid_credentials", "Wrong username or password.") }));
    await expect(api("/api/auth/login", { method: "POST", json: {}, auth: false })).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(calls).toHaveLength(1);
  });

  it("keeps the session when the refresh fails on the server or the network", async () => {
    mockFetch(() => ({ status: 503, body: apiError("service_unavailable") }));
    expect(await refreshSession()).toBe("offline");
    expect(getSession()?.accessToken).toBe("old-token");
    mockFetch(() => "network-error");
    expect(await refreshSession()).toBe("offline");
    expect(getSession()).not.toBeNull();
  });

  it("ends the session when the demo barangay has ended", async () => {
    mockFetch(() => ({ status: 401, body: apiError("session_expired") }));
    expect(await refreshSession()).toBe("ended");
    expect(getSession()).toBeNull();
    expect(getStatus()).toBe("ended");
  });

  it("asks for Filipino messages when the locale is Filipino", async () => {
    document.cookie = "NEXT_LOCALE=fil; Path=/";
    const { calls } = mockFetch(() => ({ status: 200, body: {} }));
    await api("/api/document-types");
    expect(header(calls[0]!.init, "accept-language")).toBe("fil");
  });

  it("turns a network failure into service_unavailable", async () => {
    mockFetch(() => "network-error");
    const err = await api("/api/me").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "service_unavailable", status: 0 });
  });
});
