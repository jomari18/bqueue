import { vi } from "vitest";

type Reply = { status: number; body?: unknown };
type Handler = (url: string, init: RequestInit) => Reply | Promise<Reply> | "network-error";

/** Replaces fetch with a list of handlers tried in order; records every call. */
export function mockFetch(handler: Handler) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    const reply = await handler(url, init);
    if (reply === "network-error") throw new TypeError("Failed to fetch");
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

export const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

export const session = (role: "KAPITAN" | "STAFF" | "RESIDENT" = "STAFF", token = "access-1") => ({
  accessToken: token,
  user: { id: "u1", role, username: `${role.toLowerCase()}.7k2f`, displayName: role === "STAFF" ? "Kuya Ramil" : "Juan Dela Cruz" },
  barangay: { id: "b1", code: "7k2f", name: "Barangay Masagana", city: "Lungsod ng Kalayaan", expiresAt: "2026-10-29T04:00:00.000Z", simulatorOn: true },
});

export const apiError = (code: string, message = code) => ({ error: { code, message } });
