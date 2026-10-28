import type { DocumentData } from "@bq/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrintDocument } from "../src/features/print/PrintDocument";
import { clearSession, setSession } from "../src/lib/auth/session";
import { formatManilaDate, formatManilaTime } from "../src/lib/format";
import { apiError, mockFetch, session } from "./support/fetch";
import { renderWithIntl } from "./support/render";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }), usePathname: () => "/print/r9" }));

const data = (over: Partial<DocumentData["request"]> = {}): DocumentData => ({
  request: {
    id: "r9",
    status: "RELEASED",
    documentType: { code: "INDIGENCY", nameEn: "Certificate of Indigency", nameFil: "Katibayan ng Kahirapan" },
    purpose: "Medical assistance",
    businessName: null,
    feeCentavos: 5000,
    rejectReason: null,
    orNumber: "OR-2026001",
    verificationCode: "ABCDEFGHJK",
    validUntil: "2027-04-26T02:00:00.000Z",
    revokedAt: null,
    revokeReason: null,
    resident: { id: "res1", fullName: "Maria Santos" },
    createdAt: "2026-10-27T01:00:00.000Z",
    updatedAt: "2026-10-28T02:00:00.000Z",
    ...over,
  },
  resident: { fullName: "Maria Santos", birthDate: "1990-05-01", sex: "FEMALE", civilStatus: "MARRIED", purok: 3, addressLine: "12 Sampaguita St.", residentSince: 2016 },
  barangay: { name: "Barangay Masagana", city: "Lungsod ng Kalayaan" },
  kapitan: { displayName: "Hon. Teresa Villanueva" },
  approvedAt: "2026-10-28T01:30:00.000Z",
  releasedAt: "2026-10-28T02:00:00.000Z",
});

describe("A4 print view", () => {
  beforeEach(() => {
    clearSession("signed-out");
    replace.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lays out the released document with the signature and a QR to verify it", async () => {
    setSession(session("STAFF"));
    const { calls } = mockFetch(() => ({ status: 200, body: data() }));
    renderWithIntl(<PrintDocument id="r9" />);
    expect(await screen.findByText("Barangay Masagana")).toBeInTheDocument();
    expect(calls[0]!.url).toBe("/api/requests/r9/document");
    expect(screen.getByRole("img", { name: "B.Queue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Certificate of Indigency/ })).toHaveTextContent("Katibayan ng Kahirapan");
    const body = screen.getByTestId("certification");
    expect(body).toHaveTextContent("Maria Santos");
    expect(body).toHaveTextContent("married");
    expect(body).toHaveTextContent("Purok 3");
    expect(body).toHaveTextContent("12 Sampaguita St.");
    expect(body).toHaveTextContent("10 years");
    expect(body).toHaveTextContent("Medical assistance");
    expect(screen.getByText("Fee: ₱50.00 · OR No. OR-2026001")).toBeInTheDocument();
    expect(screen.getByText(`Issued ${formatManilaDate("2026-10-28T02:00:00.000Z", "en")}`)).toBeInTheDocument();
    expect(screen.getByText(`Valid until ${formatManilaDate("2027-04-26T02:00:00.000Z", "en")}`)).toBeInTheDocument();
    const on = `${formatManilaDate("2026-10-28T01:30:00.000Z", "en")}, ${formatManilaTime("2026-10-28T01:30:00.000Z", "en")}`;
    expect(screen.getByText(`Signed electronically by Hon. Teresa Villanueva, Punong Barangay, on ${on}`)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Scan to verify/ })).toHaveAttribute("data-value", `${location.origin}/verify/ABCDE-FGHJK`);
    expect(screen.getByText("ABCDE-FGHJK")).toBeInTheDocument();
  });

  it("adds the business name to a Business Clearance and says Free when there is no fee", async () => {
    setSession(session("STAFF"));
    mockFetch(() => ({
      status: 200,
      body: data({ documentType: { code: "BUSINESS", nameEn: "Business Clearance", nameFil: "Clearance sa Negosyo" }, businessName: "Aling Nena's Sari-sari", feeCentavos: 0, orNumber: null }),
    }));
    renderWithIntl(<PrintDocument id="r9" />);
    expect(await screen.findByTestId("certification")).toHaveTextContent("Aling Nena's Sari-sari");
    expect(screen.getByText("Free")).toBeInTheDocument();
  });

  it("prints from the Print button", async () => {
    setSession(session("STAFF"));
    const print = vi.fn();
    vi.stubGlobal("print", print);
    mockFetch(() => ({ status: 200, body: data() }));
    renderWithIntl(<PrintDocument id="r9" />);
    await userEvent.click(await screen.findByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalled();
  });

  it("says when the document is not released yet", async () => {
    setSession(session("STAFF"));
    mockFetch(() => ({ status: 409, body: apiError("invalid_transition") }));
    renderWithIntl(<PrintDocument id="r9" />);
    expect(await screen.findByText("This document is not released yet.")).toBeInTheDocument();
  });

  it("restores the session in a new tab and sends a signed-out visitor to the login", async () => {
    mockFetch((url) => (url === "/api/auth/refresh" ? { status: 401, body: apiError("session_expired") } : { status: 200, body: { ok: true } }));
    renderWithIntl(<PrintDocument id="r9" wakeIntervalMs={10} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
