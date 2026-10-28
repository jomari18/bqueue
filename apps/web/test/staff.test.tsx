import type { CounterView, RequestSummary, TicketView } from "@bq/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CounterScreen } from "../src/features/staff/CounterScreen";
import { RequestBoard } from "../src/features/staff/RequestBoard";
import { clearSession, setSession } from "../src/lib/auth/session";
import { apiError, mockFetch, session } from "./support/fetch";
import { renderWithIntl } from "./support/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/staff" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const req = (over: Partial<RequestSummary>): RequestSummary => ({
  id: "r1",
  status: "SUBMITTED",
  documentType: { code: "CLEARANCE", nameEn: "Barangay Clearance", nameFil: "Barangay Clearance" },
  purpose: "Employment",
  businessName: null,
  feeCentavos: 10000,
  rejectReason: null,
  orNumber: null,
  verificationCode: null,
  validUntil: null,
  revokedAt: null,
  revokeReason: null,
  resident: { id: "res1", fullName: "Maria Santos" },
  createdAt: "2026-10-28T01:00:00.000Z",
  updatedAt: "2026-10-28T01:00:00.000Z",
  ...over,
});
const ticket = (over: Partial<TicketView>): TicketView => ({
  id: "tk1", code: "D-012", lane: "DOCUMENTS", number: 12, status: "CALLED", source: "PHONE", queuedAt: "2026-10-28T01:00:00.000Z",
  calledAt: "2026-10-28T01:10:00.000Z", counterName: "Counter 2", callCount: 1, rejoined: false, requestId: null, ahead: 0, etaMinutes: 0, ...over,
});
const counter = (current: CounterView["current"], over: Partial<CounterView> = {}): CounterView => ({
  id: "c2", name: "Counter 2", lanes: ["PRIORITY", "DOCUMENTS", "GENERAL"], open: true, sortOrder: 2, staff: { id: "u1", displayName: "Kuya Ramil" }, current, ...over,
});
const me = (counterId: string | null) => ({ user: session("STAFF").user, barangay: session("STAFF").barangay, residentId: null, counterId });

describe("staff screens", () => {
  beforeEach(() => {
    clearSession("signed-out");
    setSession(session("STAFF"));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists submitted requests and forwards or rejects them", async () => {
    let list = [req({ id: "r1" }), req({ id: "r2", resident: { id: "x", fullName: "Jose Reyes" } })];
    const { calls } = mockFetch((url, init) => {
      if (init.method === "POST") {
        list = list.filter((r) => !url.includes(r.id));
        return { status: 200, body: req({}) };
      }
      return { status: 200, body: list };
    });
    renderWithIntl(<RequestBoard />);
    const first = await screen.findByText("Maria Santos");
    const card = first.closest("article")!;
    await userEvent.click(within(card).getByRole("button", { name: "Forward to the kapitan" }));
    await waitFor(() => expect(screen.queryByText("Maria Santos")).not.toBeInTheDocument());
    const second = screen.getByText("Jose Reyes").closest("article")!;
    await userEvent.click(within(second).getByRole("button", { name: "Reject" }));
    const reason = within(second).getByLabelText("Reason");
    const confirm = within(second).getByRole("button", { name: "Reject request" });
    expect(confirm).toBeDisabled();
    await userEvent.type(reason, "Incomplete details");
    await userEvent.click(confirm);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/requests/r2/reject")).toBe(true));
    expect(JSON.parse(calls.find((c) => c.url === "/api/requests/r2/reject")!.init.body as string)).toEqual({ reason: "Incomplete details" });
  });

  it("asks staff without a counter to pick one", async () => {
    mockFetch((url) => (url === "/api/me" ? { status: 200, body: me(null) } : { status: 200, body: [counter(null, { staff: null })] }));
    renderWithIntl(<CounterScreen />);
    expect(await screen.findByRole("button", { name: "Use Counter 2" })).toBeInTheDocument();
  });

  it("calls the next number and shows the counter's ticket after a busy answer, without an error", async () => {
    let current: CounterView["current"] = null;
    const { calls } = mockFetch((url) => {
      if (url === "/api/me") return { status: 200, body: me("c2") };
      if (url === "/api/counters") return { status: 200, body: [counter(current)] };
      if (url.endsWith("/call-next")) {
        if (current) return { status: 409, body: apiError("counter_busy", "This counter is still serving a number.") };
        current = { ...ticket({}), request: null };
        return { status: 200, body: { ticket: current } };
      }
      return { status: 200, body: [] };
    });
    renderWithIntl(<CounterScreen />);
    await userEvent.dblClick(await screen.findByRole("button", { name: "Call next" }));
    expect(await screen.findByText("D-012")).toBeInTheDocument();
    expect(screen.queryByText("This counter is still serving a number.")).not.toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith("/call-next")).length).toBeLessThanOrEqual(2);
  });

  it("stops call again at 3 calls and says when nobody waits", async () => {
    mockFetch((url) => {
      if (url === "/api/me") return { status: 200, body: me("c2") };
      if (url === "/api/counters") return { status: 200, body: [counter({ ...ticket({ callCount: 3 }), request: null })] };
      return { status: 200, body: [] };
    });
    renderWithIntl(<CounterScreen />);
    expect(await screen.findByRole("button", { name: "Called 3 times" })).toBeDisabled();
  });

  it("says nobody is waiting", async () => {
    mockFetch((url) => {
      if (url === "/api/me") return { status: 200, body: me("c2") };
      if (url === "/api/counters") return { status: 200, body: [counter(null)] };
      if (url.endsWith("/call-next")) return { status: 200, body: { ticket: null } };
      return { status: 200, body: [] };
    });
    renderWithIntl(<CounterScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Call next" }));
    expect(await screen.findByText("No one is waiting.")).toBeInTheDocument();
  });

  it("releases a pickup with the ID check and the OR number, then offers printing", async () => {
    const pickup = req({ id: "r9", status: "READY_FOR_PICKUP" });
    const { calls } = mockFetch((url) => {
      if (url === "/api/me") return { status: 200, body: me("c2") };
      if (url === "/api/counters") return { status: 200, body: [counter({ ...ticket({ requestId: "r9" }), request: pickup })] };
      if (url === "/api/requests/r9/release") return { status: 200, body: req({ id: "r9", status: "RELEASED" }) };
      return { status: 200, body: [] };
    });
    renderWithIntl(<CounterScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Release document" }));
    const release = screen.getByRole("button", { name: "Release" });
    expect(release).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Valid ID shown"));
    await userEvent.type(screen.getByLabelText("OR number"), "OR-2026001");
    await userEvent.click(release);
    expect(await screen.findByRole("link", { name: "Print document" })).toHaveAttribute("href", "/print/r9");
    expect(JSON.parse(calls.find((c) => c.url === "/api/requests/r9/release")!.init.body as string)).toEqual({ idChecked: true, orNumber: "OR-2026001" });
  });

  it("keeps Served off until a pickup is released, but allows Missed", async () => {
    const pickup = req({ id: "r9", status: "READY_FOR_PICKUP" });
    mockFetch((url) => {
      if (url === "/api/me") return { status: 200, body: me("c2") };
      if (url === "/api/counters") return { status: 200, body: [counter({ ...ticket({ requestId: "r9" }), request: pickup })] };
      return { status: 200, body: [] };
    });
    renderWithIntl(<CounterScreen />);
    expect(await screen.findByRole("button", { name: "Served" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Missed" })).toBeEnabled();
    expect(screen.getByText("Release the document before marking it served.")).toBeInTheDocument();
  });

  it("lets a missed ticket rejoin", async () => {
    const { calls } = mockFetch((url) => {
      if (url === "/api/me") return { status: 200, body: me("c2") };
      if (url === "/api/counters") return { status: 200, body: [counter(null)] };
      if (url.startsWith("/api/queue/tickets?status=MISSED")) return { status: 200, body: [ticket({ id: "m1", code: "G-004", status: "MISSED" })] };
      return { status: 200, body: { ticket: ticket({}) } };
    });
    renderWithIntl(<CounterScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Rejoin G-004" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/queue/tickets/m1/rejoin")).toBe(true));
  });
});
