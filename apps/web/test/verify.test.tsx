import type { VerifyResult as VerifyView } from "@bq/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyForm } from "../src/features/verify/VerifyForm";
import { VerifyResult } from "../src/features/verify/VerifyResult";
import { clearSession, setSession } from "../src/lib/auth/session";
import { formatManilaDate } from "../src/lib/format";
import { apiError, header, mockFetch, session } from "./support/fetch";
import { renderWithIntl } from "./support/render";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/verify" }));

const result = (status: VerifyView["status"]): VerifyView => ({
  status,
  documentName: { en: "Certificate of Indigency", fil: "Katibayan ng Kahirapan" },
  fullName: "Maria Santos",
  issuedAt: "2026-10-28T02:00:00.000Z",
  validUntil: "2027-04-26T02:00:00.000Z",
  barangay: { name: "Barangay Masagana", city: "Lungsod ng Kalayaan" },
});

describe("verify form", () => {
  beforeEach(() => push.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes a typed code before opening it", async () => {
    renderWithIntl(<VerifyForm />);
    await userEvent.type(screen.getByLabelText("Verification code"), "abcde fghjk");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(push).toHaveBeenCalledWith("/verify/ABCDE-FGHJK");
  });

  it("reads O as zero and I or L as one", async () => {
    renderWithIntl(<VerifyForm />);
    await userEvent.type(screen.getByLabelText("Verification code"), "o0il1 23456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(push).toHaveBeenCalledWith("/verify/00111-23456");
  });

  it("explains an impossible code without asking the server", async () => {
    const { calls } = mockFetch(() => ({ status: 200, body: {} }));
    renderWithIntl(<VerifyForm />);
    await userEvent.type(screen.getByLabelText("Verification code"), "ABC-12U");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(screen.getByText("Check the code: 10 letters and numbers.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});

describe("verify result", () => {
  beforeEach(() => clearSession("signed-out"));
  afterEach(() => vi.unstubAllGlobals());

  it("shows a valid document with its name, dates and barangay, without signing in", async () => {
    setSession(session("STAFF"));
    const { calls } = mockFetch(() => ({ status: 200, body: result("VALID") }));
    renderWithIntl(<VerifyResult code="ABCDE-FGHJK" />, { locale: "fil" });
    expect(await screen.findByRole("heading", { name: "Tunay na dokumento" })).toBeInTheDocument();
    expect(screen.getByText("Katibayan ng Kahirapan")).toBeInTheDocument();
    expect(screen.getByText("Maria Santos")).toBeInTheDocument();
    expect(screen.getByText(formatManilaDate("2026-10-28T02:00:00.000Z", "fil"))).toBeInTheDocument();
    expect(screen.getByText(formatManilaDate("2027-04-26T02:00:00.000Z", "fil"))).toBeInTheDocument();
    expect(screen.getByText("Barangay Masagana, Lungsod ng Kalayaan")).toBeInTheDocument();
    expect(screen.getByTestId("verify-status")).toHaveAttribute("data-tone", "valid");
    const verify = calls.find((c) => c.url.startsWith("/api/verify/"))!;
    expect(verify.url).toBe("/api/verify/ABCDE-FGHJK");
    expect(header(verify.init, "authorization")).toBeNull();
  });

  it.each([
    ["EXPIRED", "This document has expired"],
    ["REVOKED", "This document was revoked"],
  ] as const)("shows %s with its own heading", async (status, heading) => {
    mockFetch(() => ({ status: 200, body: result(status) }));
    renderWithIntl(<VerifyResult code="ABCDE-FGHJK" />);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByTestId("verify-status")).not.toHaveAttribute("data-tone", "valid");
  });

  it("wakes the free API before asking, so a scan after a quiet hour still answers", async () => {
    // Render's cold start outlasts the proxy's 26 seconds; the page pings the API directly first (review 6).
    let awake = false;
    const { calls } = mockFetch((url) => {
      if (url.endsWith("/api/health")) return awake ? { status: 200, body: { ok: true } } : "network-error";
      return { status: 200, body: result("VALID") };
    });
    renderWithIntl(<VerifyResult code="ABCDE-FGHJK" wakeIntervalMs={10} />);
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/api/health")).length).toBeGreaterThan(1));
    expect(calls.some((c) => c.url.startsWith("/api/verify/"))).toBe(false);
    awake = true;
    expect(await screen.findByRole("heading", { name: "Valid document" })).toBeInTheDocument();
  });

  it("says when no document has the code", async () => {
    mockFetch((url) => (url.endsWith("/api/health") ? { status: 200, body: { ok: true } } : { status: 404, body: apiError("not_found") }));
    renderWithIntl(<VerifyResult code="ABCDE-FGHJK" />);
    expect(await screen.findByRole("heading", { name: "No document has this code" })).toBeInTheDocument();
  });

  it("does not ask the server about a code that cannot exist", async () => {
    const { calls } = mockFetch(() => ({ status: 200, body: result("VALID") }));
    renderWithIntl(<VerifyResult code="nope" />);
    expect(await screen.findByRole("heading", { name: "No document has this code" })).toBeInTheDocument();
    await waitFor(() => expect(calls).toHaveLength(0));
  });
});
