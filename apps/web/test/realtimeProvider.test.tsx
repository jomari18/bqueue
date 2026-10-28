import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSession, getSession, setSession } from "../src/lib/auth/session";
import type { RealtimeEvent } from "../src/lib/realtime/connection";
import { RealtimeProvider } from "../src/lib/realtime/hooks";
import { apiError, mockFetch, session } from "./support/fetch";
import { renderWithIntl } from "./support/render";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }), usePathname: () => "/r" }));

const h = vi.hoisted(() => ({ onEvent: null as null | ((e: RealtimeEvent) => void) }));
vi.mock("../src/lib/realtime/connection", async (original) => ({
  ...(await original<typeof import("../src/lib/realtime/connection")>()),
  connectRealtime: (opts: { onEvent: (e: RealtimeEvent) => void }) => {
    h.onEvent = opts.onEvent;
    return { close: () => undefined };
  },
}));

describe("session:revoked", () => {
  beforeEach(() => {
    clearSession("signed-out");
    setSession(session("RESIDENT"));
    replace.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps a device whose own session still refreshes (another device of the same user signed out)", async () => {
    // Switching roles on the laptop signs Juan out there; the phone that joined by QR has its own session (review 3).
    const { calls } = mockFetch((url) => (url === "/api/auth/refresh" ? { status: 200, body: session("RESIDENT", "access-2") } : { status: 200, body: {} }));
    renderWithIntl(<RealtimeProvider>page</RealtimeProvider>);
    await act(async () => h.onEvent?.({ type: "session:revoked", payload: {} }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/auth/refresh")).toBe(true));
    expect(getSession()?.accessToken).toBe("access-2");
    expect(replace).not.toHaveBeenCalled();
  });

  it("signs out a device whose session was revoked too", async () => {
    mockFetch((url) => (url === "/api/auth/refresh" ? { status: 401, body: apiError("unauthenticated") } : { status: 200, body: {} }));
    renderWithIntl(<RealtimeProvider>page</RealtimeProvider>);
    await act(async () => h.onEvent?.({ type: "session:revoked", payload: {} }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getSession()).toBeNull();
  });
});
