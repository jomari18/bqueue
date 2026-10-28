import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/features/shell/AppShell";
import { clearSession, setStatus } from "../src/lib/auth/session";
import { apiError, mockFetch, session } from "./support/fetch";
import { renderWithIntl } from "./support/render";

const replace = vi.fn();
let pathname = "/staff/counter";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: replace, refresh: vi.fn() }), usePathname: () => pathname }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

describe("app shell boot", () => {
  beforeEach(() => {
    clearSession("signed-out");
    localStorage.clear();
    replace.mockClear();
    pathname = "/staff/counter";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("waits for the server to wake, then shows the page for a signed-in staff member", async () => {
    let awake = false;
    mockFetch((url) => {
      if (url.endsWith("/api/health")) return awake ? { status: 200, body: { ok: true } } : "network-error";
      if (url === "/api/auth/refresh") return { status: 200, body: session("STAFF") };
      return { status: 404, body: apiError("not_found") };
    });
    renderWithIntl(<AppShell wakeIntervalMs={10}>page body</AppShell>);
    expect(await screen.findByText(/Waking up the server/)).toBeInTheDocument();
    awake = true;
    expect(await screen.findByText("page body")).toBeInTheDocument();
  });

  it("sends a resident away from staff pages", async () => {
    mockFetch((url) => (url === "/api/auth/refresh" ? { status: 200, body: session("RESIDENT") } : { status: 200, body: { ok: true } }));
    renderWithIntl(<AppShell wakeIntervalMs={10}>page body</AppShell>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/r"));
  });

  it("says when the demo barangay has ended", async () => {
    mockFetch((url) => (url === "/api/auth/refresh" ? { status: 401, body: apiError("session_expired") } : { status: 200, body: { ok: true } }));
    renderWithIntl(<AppShell wakeIntervalMs={10}>page body</AppShell>);
    expect(await screen.findByText("This demo barangay has ended.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start a new demo" })).toHaveAttribute("href", "/");
  });

  it("says the demo ended when its barangay was already deleted", async () => {
    // Cleanup deletes an expired barangay and its sessions, so the API no longer says session_expired (review 2).
    setStatus("booting"); // as a freshly opened page starts
    localStorage.setItem(
      "bq-demo",
      JSON.stringify({ barangay: { code: "7k2f", name: "Barangay Masagana", expiresAt: "2020-01-01T00:00:00.000Z" }, logins: {}, displayLink: "", kioskLink: "", joinLink: "", joinExpiresAt: "" }),
    );
    mockFetch((url) => (url === "/api/auth/refresh" ? { status: 401, body: apiError("unauthenticated") } : { status: 200, body: { ok: true } }));
    renderWithIntl(<AppShell wakeIntervalMs={10}>page body</AppShell>);
    expect(await screen.findByText("This demo barangay has ended.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith("/login");
  });

  it("alerts a resident who is called while on another page", async () => {
    // The alerts belong to the whole resident app, not only to My ticket (review 5).
    pathname = "/r/requests";
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const called = { id: "tk1", code: "D-012", lane: "DOCUMENTS", number: 12, status: "CALLED", source: "PHONE", queuedAt: "2026-10-28T01:00:00.000Z", calledAt: "2026-10-28T01:10:00.000Z", counterName: "Counter 2", callCount: 1, rejoined: false, requestId: null, ahead: 0, etaMinutes: 0 };
    mockFetch((url) => {
      if (url === "/api/auth/refresh") return { status: 200, body: session("RESIDENT") };
      if (url === "/api/queue/tickets/mine") return { status: 200, body: [called] };
      return { status: 200, body: [] };
    });
    renderWithIntl(<AppShell wakeIntervalMs={10}>requests page</AppShell>);
    expect(await screen.findByRole("alertdialog", { name: "Your turn! Counter 2" })).toBeInTheDocument();
  });

  it("sends signed-out visitors to the login page", async () => {
    mockFetch((url) => (url === "/api/auth/refresh" ? { status: 401, body: apiError("unauthenticated") } : { status: 200, body: { ok: true } }));
    renderWithIntl(<AppShell wakeIntervalMs={10}>page body</AppShell>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
