import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TicketStage } from "../src/landing/TicketStage";

// The scene module stands in for three.js; loading it counts as "the scene was imported".
const h = vi.hoisted(() => ({ loads: 0 }));
vi.mock("../src/landing/ticket3d/TicketScene", () => {
  h.loads += 1;
  return { TicketScene: () => <div>scene</div> };
});

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}
function setWebgl(works: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() => (works ? { getExtension: () => ({ loseContext: () => undefined }) } : null)) as unknown as HTMLCanvasElement["getContext"],
  );
}
const ALT = "A green B.Queue ticket, D-012, behind ribbed glass";

describe("ticket stage", () => {
  beforeEach(() => {
    h.loads = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows only the still under reduced motion and never loads the scene", async () => {
    setReducedMotion(true);
    setWebgl(true);
    render(<TicketStage />);
    expect(screen.getByRole("img", { name: ALT })).toHaveAttribute("src", "/ticket-still.webp");
    fireEvent.pointerMove(window);
    await act(async () => undefined);
    expect(screen.queryByTestId("ticket-canvas")).not.toBeInTheDocument();
    expect(h.loads).toBe(0);
  });

  it("shows only the still without WebGL", async () => {
    setReducedMotion(false);
    setWebgl(false);
    render(<TicketStage />);
    fireEvent.pointerMove(window);
    await act(async () => undefined);
    expect(screen.getByRole("img", { name: ALT })).toBeInTheDocument();
    expect(screen.queryByTestId("ticket-canvas")).not.toBeInTheDocument();
    expect(h.loads).toBe(0);
  });

  it("waits for the visitor's first move, then loads the scene", async () => {
    setReducedMotion(false);
    setWebgl(true);
    render(<TicketStage />);
    await act(async () => undefined);
    expect(screen.queryByTestId("ticket-canvas")).not.toBeInTheDocument();
    expect(h.loads).toBe(0);
    fireEvent.pointerMove(window);
    expect(await screen.findByText("scene")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-canvas")).toBeInTheDocument();
    expect(h.loads).toBe(1);
  });
});
