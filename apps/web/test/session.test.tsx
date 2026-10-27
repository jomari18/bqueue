import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/features/shell/AppShell";
import { clearSession } from "../src/lib/auth/session";
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

  it("sends signed-out visitors to the login page", async () => {
    mockFetch((url) => (url === "/api/auth/refresh" ? { status: 401, body: apiError("unauthenticated") } : { status: 200, body: { ok: true } }));
    renderWithIntl(<AppShell wakeIntervalMs={10}>page body</AppShell>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
