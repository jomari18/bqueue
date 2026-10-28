import type { DemoStartResult } from "@bq/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Landing } from "../src/landing/Landing";
import { loadDemo } from "../src/lib/auth/demo-store";
import { clearSession, getSession } from "../src/lib/auth/session";
import { apiError, mockFetch, session } from "./support/fetch";
import { renderWithIntl } from "./support/render";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const started = (): DemoStartResult => ({
  ...session("STAFF"),
  demoLogins: {
    kapitan: { username: "kapitan.7k2f", password: "correct-horse-battery" },
    staff: { username: "staff.7k2f", pin: "482913" },
    resident: { username: "juan.7k2f", password: "another-long-secret" },
  },
  displayLink: "http://localhost:3000/display#d",
  kioskLink: "http://localhost:3000/kiosk#k",
  joinLink: "http://localhost:3000/join#j",
  joinExpiresAt: "2026-10-28T05:00:00.000Z",
  expiresAt: "2026-10-29T04:00:00.000Z",
});

describe("landing", () => {
  beforeEach(() => {
    clearSession("signed-out");
    localStorage.clear();
    push.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("wakes the API directly on load", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_WAKE_URL", "https://bq-api.example.com/api/health");
    vi.resetModules();
    const { calls } = mockFetch(() => ({ status: 200, body: { ok: true } }));
    const fresh = await import("../src/landing/Landing");
    renderWithIntl(<fresh.Landing />);
    await waitFor(() => expect(calls.some((c) => c.url === "https://bq-api.example.com/api/health")).toBe(true));
  });

  it("shows the brand, the four features, the language toggle and the credits link", () => {
    mockFetch(() => ({ status: 200, body: { ok: true } }));
    renderWithIntl(<Landing />);
    const brand = screen.getByText("B.Queue", { selector: "h1 *" });
    expect(brand.className).toContain("font-display");
    expect(screen.getByText("Barangay requests and a live queue, in one place.")).toBeInTheDocument();
    const features = screen.getAllByRole("region", { name: /./ }).filter((r) => r.dataset.feature);
    expect(features.map((f) => f.dataset.feature)).toEqual(["requests", "queue", "tv", "verify"]);
    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "Credits" })).toHaveAttribute("href", "/credits");
  });

  it("opens a demo barangay once, even on a double click, while the server wakes", async () => {
    let awake = false;
    const { calls } = mockFetch((url) => {
      if (url.endsWith("/api/health")) return awake ? { status: 200, body: { ok: true } } : "network-error";
      if (url === "/api/demo") return { status: 201, body: started() };
      return { status: 404 };
    });
    renderWithIntl(<Landing wakeIntervalMs={10} />);
    const button = screen.getAllByRole("button", { name: "Try the demo" })[0]!;
    await userEvent.dblClick(button);
    expect(await screen.findAllByText("Opening your barangay… (the free server takes up to a minute to wake up)")).not.toHaveLength(0);
    awake = true;
    await waitFor(() => expect(push).toHaveBeenCalledWith("/staff/counter"));
    expect(calls.filter((c) => c.url === "/api/demo")).toHaveLength(1);
    expect(calls.find((c) => c.url === "/api/demo")!.init.method).toBe("POST");
    expect(getSession()?.user.role).toBe("STAFF");
    expect(loadDemo(new Date("2026-10-28T06:00:00.000Z"))?.kioskLink).toBe("http://localhost:3000/kiosk#k");
  });

  it("explains the daily demo limit and offers to sign in", async () => {
    mockFetch((url) =>
      url === "/api/demo"
        ? { status: 429, body: apiError("demo_limit", "You've opened the most demo barangays for today. Please try again tomorrow.") }
        : { status: 200, body: { ok: true } },
    );
    renderWithIntl(<Landing wakeIntervalMs={10} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Try the demo" })[0]!);
    const message = await screen.findByText(/You've opened the most demo barangays for today\. Please try again tomorrow\./);
    expect(within(message).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("says when the demo is full", async () => {
    mockFetch((url) =>
      url === "/api/demo" ? { status: 503, body: apiError("demo_full", "The demo is full right now. Please try again later.") } : { status: 200, body: { ok: true } },
    );
    renderWithIntl(<Landing wakeIntervalMs={10} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Try the demo" })[0]!);
    expect(await screen.findByText("The demo is full right now. Please try again later.")).toBeInTheDocument();
  });
});
