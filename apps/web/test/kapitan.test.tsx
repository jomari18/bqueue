import type { CounterView, DocumentTypeView, ReportSummary, RequestSummary, StaffView } from "@bq/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Approvals } from "../src/features/kapitan/Approvals";
import { BarChart } from "../src/features/kapitan/BarChart";
import { ReleasedList } from "../src/features/kapitan/ReleasedList";
import { Reports } from "../src/features/kapitan/Reports";
import { Counters } from "../src/features/kapitan/settings/Counters";
import { DocumentTypes } from "../src/features/kapitan/settings/DocumentTypes";
import { Keys } from "../src/features/kapitan/settings/Keys";
import { Simulator } from "../src/features/kapitan/settings/Simulator";
import { Staff } from "../src/features/kapitan/settings/Staff";
import * as demoStore from "../src/lib/auth/demo-store";
import { clearSession, setSession } from "../src/lib/auth/session";
import { mockFetch, session } from "./support/fetch";
import { renderWithIntl } from "./support/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/kapitan" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const req = (over: Partial<RequestSummary>): RequestSummary => ({
  id: "r1",
  status: "FOR_APPROVAL",
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
const kapitanMe = () => {
  const s = session("KAPITAN");
  return { user: { ...s.user, displayName: "Hon. Teresa Villanueva" }, barangay: s.barangay, residentId: null, counterId: null };
};
const body = (init: RequestInit) => JSON.parse(init.body as string) as unknown;

describe("kapitan screens", () => {
  beforeEach(() => {
    clearSession("signed-out");
    setSession(session("KAPITAN"));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("approves with the kapitan's electronic signature and removes the card", async () => {
    let list = [req({ id: "r1" })];
    const { calls } = mockFetch((url, init) => {
      if (url === "/api/me") return { status: 200, body: kapitanMe() };
      if (init.method === "POST") {
        list = [];
        return { status: 200, body: req({ status: "READY_FOR_PICKUP" }) };
      }
      return { status: 200, body: list };
    });
    renderWithIntl(<Approvals />);
    const card = (await screen.findByText("Maria Santos")).closest("article")!;
    await userEvent.click(within(card).getByRole("button", { name: "Approve and sign" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Signed electronically by Hon. Teresa Villanueva")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign and approve" }));
    await waitFor(() => expect(screen.queryByText("Maria Santos")).not.toBeInTheDocument());
    expect(calls.some((c) => c.url === "/api/requests/r1/approve")).toBe(true);
    expect(calls.some((c) => c.url === "/api/requests?status=FOR_APPROVAL")).toBe(true);
  });

  it("needs a reason to reject an approval", async () => {
    const { calls } = mockFetch((url) => (url === "/api/me" ? { status: 200, body: kapitanMe() } : { status: 200, body: [req({})] }));
    renderWithIntl(<Approvals />);
    const card = (await screen.findByText("Maria Santos")).closest("article")!;
    await userEvent.click(within(card).getByRole("button", { name: "Reject" }));
    const confirm = within(card).getByRole("button", { name: "Reject request" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(card).getByLabelText("Reason"), "Wrong purpose");
    await userEvent.click(confirm);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/requests/r1/reject")).toBe(true));
  });

  it("revokes a released document with a reason", async () => {
    const { calls } = mockFetch(() => ({ status: 200, body: [req({ id: "r5", status: "RELEASED", verificationCode: "BQ-7K2F-ABCD" })] }));
    renderWithIntl(<ReleasedList />);
    const card = (await screen.findByText("Maria Santos")).closest("article")!;
    await userEvent.click(within(card).getByRole("button", { name: "Revoke" }));
    const confirm = screen.getByRole("button", { name: "Revoke document" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Reason"), "Issued by mistake");
    await userEvent.click(confirm);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/requests/r5/revoke")).toBe(true));
    expect(body(calls.find((c) => c.url === "/api/requests/r5/revoke")!.init)).toEqual({ reason: "Issued by mistake" });
  });

  it("shows reports for the chosen range", async () => {
    const byHour = Array.from({ length: 24 }, (_, h) => (h === 10 ? 14 : h === 9 ? 6 : 0));
    const summary = (range: ReportSummary["range"]): ReportSummary => ({
      range,
      from: "2026-10-28T00:00:00.000Z",
      to: "2026-10-28T09:00:00.000Z",
      requests: { byTypeStatus: [], avgDaysToReady: 1.5, released: 7, feesCollectedCentavos: 70000 },
      queue: {
        lanes: [
          { lane: "PRIORITY", tickets: 4, avgWaitSeconds: 300, avgServiceSeconds: 120, noShowRate: 0 },
          { lane: "GENERAL", tickets: 16, avgWaitSeconds: 900, avgServiceSeconds: 240, noShowRate: 0.25 },
        ],
        byHour,
      },
    });
    const { calls } = mockFetch((url) => ({ status: 200, body: summary(new URL(url, "http://x").searchParams.get("range") as ReportSummary["range"]) }));
    renderWithIntl(<Reports />);
    expect(await screen.findByText("₱700.00")).toBeInTheDocument();
    expect(screen.getByText("Released documents")).toBeInTheDocument();
    expect(screen.getByText("1.5")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Tickets by hour, busiest 10:00 with 14" })).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("General")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "7 days" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/reports/summary?range=7d")).toBe(true));
    expect(screen.getByRole("tab", { name: "7 days" })).toHaveAttribute("aria-selected", "true");
  });

  it("draws an accessible bar chart", () => {
    renderWithIntl(<BarChart values={[1, 3]} labels={["9", "10"]} summary="Busiest 10" />);
    const chart = screen.getByRole("img", { name: "Busiest 10" });
    expect(chart.tagName.toLowerCase()).toBe("svg");
    expect(chart.querySelectorAll("rect")).toHaveLength(2);
  });

  it("edits a fee in pesos and switches a document type off", async () => {
    const type: DocumentTypeView = {
      id: "d1", code: "CLEARANCE", nameEn: "Barangay Clearance", nameFil: "Barangay Clearance", feeCentavos: 10000,
      processingDays: 1, validityDays: 180, needsBusinessName: false, active: true,
    };
    const { calls } = mockFetch((_url, init) => (init.method === "PATCH" ? { status: 200, body: type } : { status: 200, body: [type] }));
    renderWithIntl(<DocumentTypes />);
    const fee = await screen.findByLabelText("Fee for Barangay Clearance");
    expect(screen.getByText("Requests already submitted keep their fee.")).toBeInTheDocument();
    await userEvent.clear(fee);
    await userEvent.type(fee, "₱150");
    await userEvent.click(screen.getByRole("button", { name: "Save fee" }));
    await waitFor(() => expect(calls.some((c) => c.init.method === "PATCH")).toBe(true));
    expect(body(calls.find((c) => c.init.method === "PATCH")!.init)).toEqual({ feeCentavos: 15000 });
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(calls.filter((c) => c.init.method === "PATCH")).toHaveLength(2));
    expect(body(calls.filter((c) => c.init.method === "PATCH")[1]!.init)).toEqual({ active: false });
  });

  it("rejects a fee that is not an amount", async () => {
    const type = { id: "d1", code: "CLEARANCE", nameEn: "Barangay Clearance", nameFil: "Barangay Clearance", feeCentavos: 0, processingDays: 1, validityDays: 180, needsBusinessName: false, active: true };
    const { calls } = mockFetch(() => ({ status: 200, body: [type] }));
    renderWithIntl(<DocumentTypes />);
    const fee = await screen.findByLabelText("Fee for Barangay Clearance");
    await userEvent.clear(fee);
    await userEvent.type(fee, "fifty");
    await userEvent.click(screen.getByRole("button", { name: "Save fee" }));
    expect(await screen.findByText("Type an amount like 150 or ₱150.")).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === "PATCH")).toBe(false);
  });

  it("adds, renames and re-lanes counters", async () => {
    const c2: CounterView = { id: "c2", name: "Counter 2", lanes: ["PRIORITY", "GENERAL"], open: false, sortOrder: 2, staff: null, current: null };
    const { calls } = mockFetch((_url, init) => (init.method !== "GET" ? { status: 200, body: c2 } : { status: 200, body: [c2] }));
    renderWithIntl(<Counters />);
    const name = await screen.findByLabelText("Name of Counter 2");
    await userEvent.clear(name);
    await userEvent.type(name, "Window B");
    const row = name.closest("li")!;
    await userEvent.click(within(row).getByRole("checkbox", { name: "Documents" }));
    await userEvent.click(within(row).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.init.method === "PATCH")).toBe(true));
    expect(body(calls.find((c) => c.init.method === "PATCH")!.init)).toEqual({ name: "Window B", lanes: ["PRIORITY", "DOCUMENTS", "GENERAL"] });
    await userEvent.type(screen.getByLabelText("New counter name"), "Counter 3");
    await userEvent.click(screen.getByRole("button", { name: "Add counter" }));
    await waitFor(() => expect(calls.some((c) => c.init.method === "POST")).toBe(true));
    expect(body(calls.find((c) => c.init.method === "POST")!.init)).toEqual({ name: "Counter 3", lanes: ["PRIORITY", "DOCUMENTS", "GENERAL"] });
  });

  it("adds staff with the PIN rule, resets a PIN and deactivates after confirming", async () => {
    const ramil: StaffView = { id: "s1", username: "ramil.7k2f", displayName: "Kuya Ramil", active: true, counterName: "Counter 2" };
    const { calls } = mockFetch((_url, init) => (init.method !== "GET" ? { status: 200, body: ramil } : { status: 200, body: [ramil] }));
    renderWithIntl(<Staff />);
    expect(await screen.findByText("Kuya Ramil")).toBeInTheDocument();
    expect(screen.getAllByText("6 digits, not all the same and not in a row like 123456.").length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText("Name"), "Ate Liza");
    await userEvent.type(screen.getByLabelText("PIN"), "111111");
    await userEvent.click(screen.getByRole("button", { name: "Add staff" }));
    expect(await screen.findByText("Choose a PIN that is harder to guess.")).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === "POST")).toBe(false);
    await userEvent.clear(screen.getByLabelText("PIN"));
    await userEvent.type(screen.getByLabelText("PIN"), "482913");
    await userEvent.click(screen.getByRole("button", { name: "Add staff" }));
    await waitFor(() => expect(calls.some((c) => c.init.method === "POST")).toBe(true));
    expect(body(calls.find((c) => c.init.method === "POST")!.init)).toEqual({ displayName: "Ate Liza", pin: "482913" });

    const row = screen.getByText("Kuya Ramil").closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Reset PIN" }));
    await userEvent.type(within(row).getByLabelText("New PIN"), "905172");
    await userEvent.click(within(row).getByRole("button", { name: "Save PIN" }));
    await waitFor(() => expect(calls.filter((c) => c.init.method === "PATCH")).toHaveLength(1));
    expect(body(calls.find((c) => c.init.method === "PATCH")!.init)).toEqual({ pin: "905172" });

    await userEvent.click(within(row).getByRole("button", { name: "Deactivate" }));
    expect(calls.filter((c) => c.init.method === "PATCH")).toHaveLength(1);
    await userEvent.click(within(row).getByRole("button", { name: "Yes, deactivate Kuya Ramil" }));
    await waitFor(() => expect(calls.filter((c) => c.init.method === "PATCH")).toHaveLength(2));
    expect(body(calls.filter((c) => c.init.method === "PATCH")[1]!.init)).toEqual({ active: false });
  });

  it("rotates a screen key after a warning, shows the new link once and stores it", async () => {
    const update = vi.spyOn(demoStore, "updateDemoLinks");
    const { calls } = mockFetch(() => ({ status: 200, body: { link: "http://localhost:3000/display?key=new" } }));
    renderWithIntl(<Keys />);
    await userEvent.click(screen.getByRole("button", { name: "New TV link" }));
    expect(screen.getByText("Screens using the old link will disconnect.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Make the new link" }));
    expect(await screen.findByText("http://localhost:3000/display?key=new")).toBeInTheDocument();
    expect(calls[0]!.url).toBe("/api/settings/keys/display/rotate");
    expect(update).toHaveBeenCalledWith({ displayLink: "http://localhost:3000/display?key=new" });
  });

  it("switches the simulator", async () => {
    const { calls } = mockFetch((url) => (url === "/api/me" ? { status: 200, body: kapitanMe() } : { status: 200, body: { ...kapitanMe().barangay, simulatorOn: false } }));
    renderWithIntl(<Simulator />);
    const toggle = await screen.findByRole("switch", { name: "Practice crowd" });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/settings/simulator")).toBe(true));
    expect(body(calls.find((c) => c.url === "/api/settings/simulator")!.init)).toEqual({ on: false });
  });
});
