import type { KioskTicketResult, TicketUpdate, TicketView } from "@bq/shared";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KioskScreen } from "../src/features/kiosk/KioskScreen";
import { TrackerScreen } from "../src/features/tracker/TrackerScreen";
import type { ConnectionStatus } from "../src/lib/realtime/connection";
import { apiError, header, mockFetch } from "./support/fetch";
import { renderWithIntl } from "./support/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/kiosk" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const h = vi.hoisted(() => ({
  status: "live" as ConnectionStatus,
  update: null as TicketUpdate | null,
  kioskKey: null as string | null,
  trackerToken: null as string | null,
  rerender: new Set<() => void>(),
}));
vi.mock("../src/lib/realtime/hooks", async () => {
  const React = await import("react");
  const useLive = () => {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => {
      h.rerender.add(force);
      return () => void h.rerender.delete(force);
    }, []);
  };
  return {
    useKeyQueue: (_kind: string, key: string | null) => {
      useLive();
      h.kioskKey = key;
      return { store: { version: 1, snapshot: null, lastCall: null, needsResync: false }, status: h.status, close: vi.fn(), reconnect: vi.fn() };
    },
    useTracker: (token: string | null) => {
      useLive();
      h.trackerToken = token;
      return { update: h.update, status: h.status };
    },
  };
});
const push = (change: { status?: ConnectionStatus; update?: TicketUpdate }) =>
  act(() => {
    if (change.status) h.status = change.status;
    if (change.update) h.update = change.update;
    h.rerender.forEach((f) => f());
  });

const ticket = (over: Partial<TicketView> = {}): TicketView => ({
  id: "t1", code: "P-003", lane: "PRIORITY", number: 3, status: "WAITING", source: "KIOSK", queuedAt: "2026-10-28T01:00:00.000Z",
  calledAt: null, counterName: null, callCount: 0, rejoined: false, requestId: null, ahead: 2, etaMinutes: 6, ...over,
});
const result = (token = "track-1"): KioskTicketResult => ({ ticket: ticket(), trackingToken: token, duplicate: false });
const bodyOf = (init: RequestInit) => JSON.parse(init.body as string) as { id: string; lane: string };

describe("kiosk", () => {
  beforeEach(() => {
    h.status = "live";
    h.update = null;
    window.location.hash = "#kiosk-key-1";
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("offers three lanes and uses the key from the link", () => {
    mockFetch(() => ({ status: 201, body: result() }));
    renderWithIntl(<KioskScreen />);
    expect(screen.getByRole("button", { name: /Priority/ })).toHaveTextContent("Seniors, PWD, pregnant");
    expect(screen.getByRole("button", { name: /Documents/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /General/ })).toBeInTheDocument();
    expect(h.kioskKey).toBe("kiosk-key-1");
  });

  it("takes a ticket with the kiosk key, shows it with a tracker QR and returns after 15 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = mockFetch(() => ({ status: 201, body: result() }));
    renderWithIntl(<KioskScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Priority/ }));
    expect(await screen.findByText("P-003")).toBeInTheDocument();
    expect(calls[0]!.url).toBe("/api/kiosk/tickets");
    expect(header(calls[0]!.init, "x-kiosk-key")).toBe("kiosk-key-1");
    expect(bodyOf(calls[0]!.init).lane).toBe("PRIORITY");
    expect(screen.getByText("2 ahead · about 6 min")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Scan/ })).toHaveAttribute("data-value", `${location.origin}/t#track-1`);
    await act(async () => undefined); // let the ticket screen start its 15 s timer
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.queryByText("P-003")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /General/ })).toBeInTheDocument();
  });

  it("sends one request for a double tap", async () => {
    let finish: () => void = () => undefined;
    const { calls } = mockFetch(() => new Promise((r) => (finish = () => r({ status: 201, body: result() }))));
    renderWithIntl(<KioskScreen />);
    const general = screen.getByRole("button", { name: /General/ });
    fireEvent.click(general);
    fireEvent.click(general);
    expect(general).toBeDisabled();
    expect(screen.getByRole("button", { name: /Priority/ })).toBeDisabled();
    finish();
    expect(await screen.findByText("P-003")).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it("retries a network error with the same id and shows the returned ticket", async () => {
    let first = true;
    const { calls } = mockFetch(() => {
      if (first) {
        first = false;
        return "network-error";
      }
      return { status: 200, body: { ...result("track-2"), duplicate: true } };
    });
    renderWithIntl(<KioskScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Documents/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("P-003")).toBeInTheDocument();
    expect(calls).toHaveLength(2);
    expect(bodyOf(calls[1]!.init).id).toBe(bodyOf(calls[0]!.init).id);
    expect(screen.getByRole("img", { name: /Scan/ })).toHaveAttribute("data-value", `${location.origin}/t#track-2`);
  });

  it("uses a new id for the next person's tap", async () => {
    const { calls } = mockFetch(() => ({ status: 201, body: result() }));
    renderWithIntl(<KioskScreen />);
    fireEvent.click(screen.getByRole("button", { name: /General/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: /General/ }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(bodyOf(calls[1]!.init).id).not.toBe(bodyOf(calls[0]!.init).id);
  });

  it("asks people to wait when the kiosk is rate limited", async () => {
    mockFetch(() => ({ status: 429, body: apiError("rate_limited", "Too many requests.") }));
    renderWithIntl(<KioskScreen />);
    fireEvent.click(screen.getByRole("button", { name: /General/ }));
    expect(await screen.findByText("Please wait a moment, then try again.")).toBeInTheDocument();
  });

  it("shows the ended page when the demo barangay is gone", () => {
    mockFetch(() => ({ status: 201, body: result() }));
    renderWithIntl(<KioskScreen />);
    push({ status: "ended" });
    expect(screen.getByText("This demo barangay has ended.")).toBeInTheDocument();
  });
});

describe("ticket tracker", () => {
  const update = (over: Partial<TicketUpdate> = {}): TicketUpdate => ({
    version: 3, ticketId: "t1", code: "P-003", lane: "PRIORITY", status: "WAITING", ahead: 2, etaMinutes: 6, counterName: null, callCount: 0, rejoined: false, ...over,
  });
  beforeEach(() => {
    h.status = "live";
    h.update = null;
    window.location.hash = "#track-1";
  });

  it("follows the ticket from the link", () => {
    renderWithIntl(<TrackerScreen />);
    expect(h.trackerToken).toBe("track-1");
    push({ update: update() });
    expect(screen.getByText("P-003")).toBeInTheDocument();
    expect(screen.getByText("2 ahead · about 6 min")).toBeInTheDocument();
    expect(document.querySelectorAll("[aria-live]").length).toBeGreaterThan(0);
  });

  it("says when it is the person's turn, in Filipino", () => {
    renderWithIntl(<TrackerScreen />, { locale: "fil" });
    push({ update: update({ status: "CALLED", counterName: "Counter 2", ahead: 0 }) });
    expect(screen.getByText("Ikaw na! Counter 2")).toBeInTheDocument();
  });

  it("says when it is the person's turn and thanks them when served", () => {
    renderWithIntl(<TrackerScreen />);
    push({ update: update({ status: "CALLED", counterName: "Counter 2", ahead: 0 }) });
    expect(screen.getByText("Your turn! Counter 2")).toBeInTheDocument();
    push({ update: update({ version: 4, status: "SERVED", counterName: "Counter 2", ahead: 0 }) });
    expect(screen.getByText(/Thank you!/)).toBeInTheDocument();
  });
});
