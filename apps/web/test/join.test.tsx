import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JoinScreen } from "../src/features/demo/JoinScreen";
import { clearSession, getSession } from "../src/lib/auth/session";
import { apiError, mockFetch, session } from "./support/fetch";
import { renderWithIntl } from "./support/render";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: replace }) }));

describe("joining from a phone", () => {
  beforeEach(() => {
    clearSession("signed-out");
    replace.mockClear();
    window.location.hash = "#AAAAAAAAAAAAAAAAAAAAAA";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("signs in as the demo resident and opens the resident home", async () => {
    const { calls } = mockFetch((url) => (url === "/api/demo/join" ? { status: 200, body: session("RESIDENT") } : { status: 200, body: { ok: true } }));
    renderWithIntl(<JoinScreen wakeIntervalMs={10} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/r"));
    expect(JSON.parse(calls.find((c) => c.url === "/api/demo/join")!.init.body as string)).toEqual({ code: "AAAAAAAAAAAAAAAAAAAAAA" });
    expect(getSession()?.user.role).toBe("RESIDENT");
  });

  it("explains an expired QR code", async () => {
    mockFetch((url) => (url === "/api/demo/join" ? { status: 401, body: apiError("invalid_credentials") } : { status: 200, body: { ok: true } }));
    renderWithIntl(<JoinScreen wakeIntervalMs={10} />);
    expect(await screen.findByText("This QR code has expired. Ask for a new one on the demo panel.")).toBeInTheDocument();
  });
});
