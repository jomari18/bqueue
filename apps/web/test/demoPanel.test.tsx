import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoPanel } from "../src/features/demo/DemoPanel";
import { type DemoDevice, saveDemo } from "../src/lib/auth/demo-store";
import { clearSession, setSession } from "../src/lib/auth/session";
import { mockFetch, session } from "./support/fetch";
import { renderWithIntl } from "./support/render";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push, refresh: vi.fn() }), usePathname: () => "/staff/counter" }));

const NOW = new Date("2026-10-28T04:30:00Z");
const device = (over: Partial<DemoDevice> = {}): DemoDevice => ({
  barangay: { code: "7k2f", name: "Barangay Masagana", expiresAt: "2026-10-29T04:00:00.000Z" },
  logins: {
    kapitan: { username: "kapitan.7k2f", password: "kapitan-password-1" },
    staff: { username: "staff2.7k2f", pin: "482915" },
    resident: { username: "juan.7k2f", password: "resident-password1" },
  },
  displayLink: "https://bqueue.test/display#display-key",
  kioskLink: "https://bqueue.test/kiosk#kiosk-key",
  joinLink: "https://bqueue.test/join#join-code-1",
  joinExpiresAt: "2026-10-28T04:40:00.000Z",
  ...over,
});

describe("demo panel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    clearSession("signed-out");
    setSession(session("STAFF"));
    push.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the roles, the links and the time left", () => {
    saveDemo(device());
    mockFetch(() => ({ status: 200, body: {} }));
    renderWithIntl(<DemoPanel />);
    for (const label of ["Kapitan", "Staff – Counter 2", "Residente – Juan Dela Cruz"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("Demo barangay, deleted in 23 h")).toBeInTheDocument();
  });

  it("switches to the kapitan with the stored login", async () => {
    saveDemo(device());
    const { calls } = mockFetch((url) => (url === "/api/auth/login" ? { status: 200, body: session("KAPITAN") } : { status: 204 }));
    renderWithIntl(<DemoPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Kapitan" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/kapitan"));
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/logout", "/api/auth/login"]);
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({ username: "kapitan.7k2f", secret: "kapitan-password-1" });
  });

  it("opens the TV display in a new tab", async () => {
    saveDemo(device());
    mockFetch(() => ({ status: 200, body: {} }));
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderWithIntl(<DemoPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Open TV display" }));
    expect(open).toHaveBeenCalledWith("https://bqueue.test/display#display-key", "_blank", "noopener");
  });

  it("refreshes an expired phone QR code", async () => {
    saveDemo(device({ joinExpiresAt: "2026-10-28T04:00:00.000Z" }));
    const { calls } = mockFetch(() => ({
      status: 201,
      body: { joinLink: "https://bqueue.test/join#join-code-2", joinExpiresAt: "2026-10-28T04:40:00.000Z" },
    }));
    renderWithIntl(<DemoPanel />);
    await waitFor(() => expect(calls.map((c) => c.url)).toContain("/api/demo/join-code"));
    expect(await screen.findByRole("img", { name: /QR code/ })).toHaveAttribute("data-value", "https://bqueue.test/join#join-code-2");
  });

  it("lets only the kapitan switch the simulator", () => {
    saveDemo(device());
    mockFetch(() => ({ status: 200, body: {} }));
    renderWithIntl(<DemoPanel />);
    expect(screen.getByRole("switch", { name: "Simulated residents" })).toBeDisabled();
    expect(screen.getByText("Switch to Kapitan to change this")).toBeInTheDocument();
  });
});
