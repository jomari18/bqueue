import type { DocumentTypeView, RequestSummary, TicketView } from "@bq/shared";
import { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyRequests } from "../src/features/resident/MyRequests";
import { RequestForm } from "../src/features/resident/RequestForm";
import { ResidentHome } from "../src/features/resident/ResidentHome";
import { MyTicket } from "../src/features/resident/MyTicket";
import { ResidentAlerts } from "../src/features/resident/ResidentAlerts";
import { mergeTicketUpdate } from "../src/lib/realtime/hooks";
import { clearSession, setSession } from "../src/lib/auth/session";
import { mockFetch, session } from "./support/fetch";
import { renderWithIntl } from "./support/render";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push, refresh: vi.fn() }), usePathname: () => "/r" }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const TYPES: DocumentTypeView[] = [
  { id: "t-clear", code: "CLEARANCE", nameEn: "Barangay Clearance", nameFil: "Barangay Clearance", feeCentavos: 10000, processingDays: 1, validityDays: 180, needsBusinessName: false, active: true },
  { id: "t-indi", code: "INDIGENCY", nameEn: "Certificate of Indigency", nameFil: "Sertipiko ng Kahirapan", feeCentavos: 0, processingDays: 1, validityDays: 180, needsBusinessName: false, active: true },
  { id: "t-bus", code: "BUSINESS", nameEn: "Business Clearance", nameFil: "Business Clearance", feeCentavos: 50000, processingDays: 3, validityDays: 365, needsBusinessName: true, active: true },
];

const request = (over: Partial<RequestSummary>): RequestSummary => ({
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
  resident: { id: "res1", fullName: "Juan Dela Cruz" },
  createdAt: "2026-10-28T01:00:00.000Z",
  updatedAt: "2026-10-28T01:00:00.000Z",
  ...over,
});

const ticket = (over: Partial<TicketView>): TicketView => ({
  id: "tk1",
  code: "D-012",
  lane: "DOCUMENTS",
  number: 12,
  status: "WAITING",
  source: "PHONE",
  queuedAt: "2026-10-28T01:00:00.000Z",
  calledAt: null,
  counterName: null,
  callCount: 0,
  rejoined: false,
  requestId: null,
  ahead: 5,
  etaMinutes: 10,
  ...over,
});

describe("resident screens", () => {
  beforeEach(() => {
    clearSession("signed-out");
    setSession(session("RESIDENT"));
    push.mockClear();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks what you need, with the five documents and their fees", async () => {
    mockFetch(() => ({ status: 200, body: TYPES }));
    renderWithIntl(<ResidentHome />, { locale: "fil" });
    expect(screen.getByRole("heading", { name: "Ano ang kailangan mo?" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Sertipiko ng Kahirapan.*Libre/ })).toBeInTheDocument();
  });

  it("submits a request once, and retries with the same id after a network error", async () => {
    let attempt = 0;
    // The first try is slow and then fails, as when the free API is still waking; a double click lands meanwhile.
    const { calls } = mockFetch(() =>
      attempt++ === 0
        ? new Promise((r) => setTimeout(() => r("network-error" as never), 50))
        : { status: 201, body: { request: request({}), duplicate: false } },
    );
    renderWithIntl(<RequestForm type={TYPES[0]!} />);
    await userEvent.click(screen.getByRole("button", { name: "Employment" }));
    const submit = screen.getByRole("button", { name: "Submit request" });
    await userEvent.dblClick(submit);
    expect(calls).toHaveLength(1);
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/r/requests"));
    const ids = calls.map((c) => JSON.parse(c.init.body as string).id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(JSON.parse(calls[0]!.init.body as string).purpose).toBe("Employment");
  });

  it("shows the business name field only for Business Clearance and field errors from the API", async () => {
    mockFetch(() => ({ status: 400, body: { error: { code: "invalid_input", message: "Please check what you entered.", field: "businessName" } } }));
    renderWithIntl(<RequestForm type={TYPES[2]!} />);
    expect(screen.getByLabelText("Business name")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Purpose"), "New store");
    await userEvent.click(screen.getByRole("button", { name: "Submit request" }));
    expect(await screen.findByText("Please check what you entered.")).toBeInTheDocument();
  });

  it("shows the status timeline in Filipino and cancels only submitted requests", async () => {
    mockFetch((url) =>
      url === "/api/requests"
        ? { status: 200, body: [request({ id: "r1" }), request({ id: "r2", status: "READY_FOR_PICKUP" })] }
        : { status: 201, body: { ticket: ticket({ requestId: "r2" }), duplicate: false } },
    );
    renderWithIntl(<MyRequests />, { locale: "fil" });
    expect(await screen.findAllByText("Puwede nang kunin")).not.toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "Kanselahin ang request" })).toHaveLength(1);
  });

  it("takes a pickup number for a ready request", async () => {
    const { calls } = mockFetch((url) =>
      url === "/api/requests"
        ? { status: 200, body: [request({ id: "r2", status: "READY_FOR_PICKUP" })] }
        : { status: 201, body: { ticket: ticket({ requestId: "r2" }), duplicate: false } },
    );
    renderWithIntl(<MyRequests />);
    await userEvent.click(await screen.findByRole("button", { name: "Get a number for pickup" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/r/ticket"));
    expect(JSON.parse(calls.find((c) => c.url === "/api/queue/tickets")!.init.body as string)).toMatchObject({ lane: "DOCUMENTS", requestId: "r2" });
  });

  it("shows the position, alerts once near the front, and announces the call", async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    mockFetch(() => ({ status: 200, body: [ticket({ ahead: 5, etaMinutes: 10 })] }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithIntl(
      <>
        <ResidentAlerts />
        <MyTicket />
      </>,
      { client },
    );
    expect(await screen.findByText("5 ahead · about 10 min")).toBeInTheDocument();
    act(() => mergeTicketUpdate(client, { version: 2, ticketId: "tk1", code: "D-012", lane: "DOCUMENTS", status: "WAITING", ahead: 2, etaMinutes: 4, counterName: null, callCount: 0, rejoined: false }));
    expect(await screen.findByText("Almost your turn. Get ready.")).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledTimes(1);
    act(() => mergeTicketUpdate(client, { version: 3, ticketId: "tk1", code: "D-012", lane: "DOCUMENTS", status: "CALLED", ahead: 0, etaMinutes: 0, counterName: "Counter 2", callCount: 1, rejoined: false }));
    expect(await screen.findByRole("alertdialog", { name: "Your turn! Counter 2" })).toBeInTheDocument();
    expect(document.title).toBe("(!) D-012 · B.Queue");
  });

  it("offers a rejoin after a miss and explains an expired number", async () => {
    mockFetch(() => ({ status: 200, body: [ticket({ status: "MISSED", ahead: 0 }), ticket({ id: "tk2", code: "G-003", lane: "GENERAL", status: "CANCELLED", ahead: 0 })] }));
    renderWithIntl(<MyTicket />);
    expect(await screen.findByRole("button", { name: "Rejoin the line" })).toBeInTheDocument();
    expect(screen.getByText("This number has expired.")).toBeInTheDocument();
  });

  it("offers walk-in numbers for lanes without an active ticket", async () => {
    const { calls } = mockFetch((url, init) =>
      init.method === "POST" ? { status: 201, body: { ticket: ticket({ code: "G-001", lane: "GENERAL" }), duplicate: false } } : { status: 200, body: [ticket({})] },
    );
    renderWithIntl(<MyTicket />);
    expect(await screen.findByText("D-012")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Priority/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Documents/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^General/ }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/queue/tickets" && c.init.method === "POST")).toBe(true));
  });
});
