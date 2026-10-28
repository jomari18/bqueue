import type { QueueCalledEvent, QueueSnapshot } from "@bq/shared";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AnnouncerDeps, createAnnouncer } from "../src/features/display/announcer";
import { DisplayScreen } from "../src/features/display/DisplayScreen";
import type { ConnectionStatus, RealtimeEvent } from "../src/lib/realtime/connection";
import type { QueueStore } from "../src/lib/realtime/queueStore";
import { formatManilaDate, formatManilaTime } from "../src/lib/format";
import { renderWithIntl } from "./support/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/display" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

// The TV's connection is replaced by a hand-driven one: the test sets the store and status and sends events.
const h = vi.hoisted(() => ({
  store: { version: -1, snapshot: null, lastCall: null, needsResync: false } as unknown as QueueStore,
  status: "connecting" as ConnectionStatus,
  key: null as string | null,
  onEvent: undefined as ((e: RealtimeEvent) => void) | undefined,
  rerender: new Set<() => void>(),
  close: vi.fn(),
  reconnect: vi.fn(),
  connects: 0,
}));
vi.mock("../src/lib/realtime/hooks", async () => {
  const React = await import("react");
  return {
    useKeyQueue: (_kind: string, key: string | null, onEvent?: (e: RealtimeEvent) => void) => {
      const [, force] = React.useReducer((x: number) => x + 1, 0);
      React.useEffect(() => {
        h.rerender.add(force);
        return () => void h.rerender.delete(force);
      }, []);
      h.key = key;
      h.onEvent = onEvent;
      return { store: h.store, status: h.status, close: h.close, reconnect: h.reconnect };
    },
  };
});

const snapshot = (over: Partial<QueueSnapshot> = {}): QueueSnapshot => ({
  version: 5,
  day: "2026-10-28",
  barangay: { name: "Barangay Masagana", city: "Lungsod ng Kalayaan" },
  counters: [
    { id: "c1", name: "Counter 1", open: false, lanes: ["GENERAL"], currentCode: null, currentLane: null, callCount: 0 },
    { id: "c2", name: "Counter 2", open: true, lanes: ["DOCUMENTS"], currentCode: "D-012", currentLane: "DOCUMENTS", callCount: 1 },
  ],
  waiting: { PRIORITY: 1, DOCUMENTS: 4, GENERAL: 9 },
  lastCalls: ["G-001", "G-002", "G-003", "G-004", "G-005", "G-006"].map((code, i) => ({
    code, lane: "GENERAL" as const, counterName: "Counter 1", calledAt: `2026-10-28T01:0${i}:00.000Z`,
  })),
  ...over,
});
const called = (over: Partial<QueueCalledEvent> = {}): QueueCalledEvent => ({ version: 6, code: "D-012", lane: "DOCUMENTS", counterName: "Counter 2", callCount: 1, ...over });

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});
function push(change: { status?: ConnectionStatus; snap?: QueueSnapshot; event?: RealtimeEvent }) {
  act(() => {
    if (change.status) h.status = change.status;
    if (change.snap) h.store = { ...h.store, version: change.snap.version, snapshot: change.snap };
    if (change.event) h.onEvent?.(change.event);
    h.rerender.forEach((f) => f());
  });
}

function fakeDeps(voices: Partial<SpeechSynthesisVoice>[] = [{ lang: "fil-PH", name: "Filipino" }, { lang: "en-US", name: "English" }]) {
  const log: string[] = [];
  const deps: AnnouncerDeps = {
    playChime: vi.fn(async () => void log.push("chime")),
    speak: vi.fn(async (text: string, voice: SpeechSynthesisVoice | null) => void log.push(`speak:${voice?.name ?? "none"}:${text}`)),
    voices: () => voices as SpeechSynthesisVoice[],
  };
  return { deps, log };
}

function startDisplay(lang: "Filipino" | "English", deps: AnnouncerDeps) {
  renderWithIntl(<DisplayScreen deps={deps} />);
  fireEvent.click(screen.getByRole("button", { name: lang }));
  fireEvent.click(screen.getByRole("button", { name: "Start display" }));
  push({ status: "live", snap: snapshot() });
}

describe("announcer", () => {
  it("plays the chime then the Filipino sentence, one call after another", async () => {
    let finishFirst: () => void = () => undefined;
    const log: string[] = [];
    const speak = vi
      .fn<AnnouncerDeps["speak"]>()
      .mockImplementationOnce(async (text) => {
        log.push(text);
        await new Promise<void>((r) => (finishFirst = r));
      })
      .mockImplementation(async (text) => void log.push(text));
    const playChime = vi.fn(async () => void log.push("chime"));
    const a = createAnnouncer({ playChime, speak, voices: () => [{ lang: "fil-PH", name: "F" } as SpeechSynthesisVoice] });
    a.announce(called(), "fil");
    a.announce(called({ version: 7, code: "G-003", counterName: "Counter 1" }), "fil");
    await flush();
    expect(log).toEqual(["chime", "Numero D, sero, isa, dalawa, sa Counter 2."]);
    finishFirst();
    await flush();
    expect(log).toEqual(["chime", "Numero D, sero, isa, dalawa, sa Counter 2.", "chime", "Numero G, sero, sero, tatlo, sa Counter 1."]);
    expect(speak.mock.calls[0]![2]).toBe("fil-PH");
  });

  it("ignores a version it already announced", async () => {
    const { deps } = fakeDeps();
    const a = createAnnouncer(deps);
    a.announce(called(), "en");
    a.announce(called(), "en");
    await flush();
    expect(deps.playChime).toHaveBeenCalledTimes(1);
  });

  it("speaks English with an English voice when there is no Filipino voice", async () => {
    const { deps, log } = fakeDeps([{ lang: "en-US", name: "English" }]);
    createAnnouncer(deps).announce(called(), "fil");
    await flush();
    expect(log).toEqual(["chime", "speak:English:Now serving D, zero, one, two, at Counter 2."]);
  });

  it("keeps going when the chime cannot play", async () => {
    const { deps, log } = fakeDeps();
    deps.playChime = vi.fn(async () => Promise.reject(new Error("blocked")));
    createAnnouncer(deps).announce(called(), "en");
    await flush();
    expect(log).toEqual(["speak:English:Now serving D, zero, one, two, at Counter 2."]);
  });
});

describe("TV display", () => {
  beforeEach(() => {
    h.store = { version: -1, snapshot: null, lastCall: null, needsResync: false };
    h.status = "connecting";
    h.key = null;
    h.close.mockClear();
    h.reconnect.mockClear();
    localStorage.clear();
    window.location.hash = "#display-key-1";
  });
  afterEach(() => vi.useRealTimers());

  it("waits for a tap with a saved language choice and plays nothing before it", async () => {
    const { deps } = fakeDeps();
    renderWithIntl(<DisplayScreen deps={deps} />);
    expect(screen.getByRole("button", { name: "Filipino" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(localStorage.getItem("bq-display-lang")).toBe("en");
    expect(h.key).toBeNull();
    h.onEvent?.({ type: "queue:called", payload: called() });
    await flush();
    expect(deps.playChime).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start display" }));
    expect(h.key).toBe("display-key-1");
  });

  it("shows open counters, the last 5 calls, waiting per lane, the barangay and Manila time", () => {
    vi.useFakeTimers({ now: new Date("2026-10-28T02:00:00.000Z"), shouldAdvanceTime: true });
    const { deps } = fakeDeps();
    startDisplay("English", deps);
    expect(screen.getByRole("listitem", { name: "COUNTER 2 · D-012" })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: /COUNTER 1/ })).not.toBeInTheDocument();
    const recent = screen.getByRole("list", { name: "Recent calls" });
    expect(recent.querySelectorAll("li")).toHaveLength(5);
    expect(screen.getByText("Barangay Masagana")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText(formatManilaDate("2026-10-28T02:00:00.000Z", "en"))).toBeInTheDocument();
    expect(screen.getByText(formatManilaTime("2026-10-28T02:00:00.000Z", "en"))).toBeInTheDocument();
  });

  it("pulses the banner for 5 seconds, announces the call and repeats a call again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { deps, log } = fakeDeps();
    startDisplay("Filipino", deps);
    push({ event: { type: "queue:called", payload: called() } });
    await flush();
    const banner = screen.getByTestId("call-banner");
    expect(banner).toHaveTextContent("D-012");
    expect(banner.className).toContain("animate-call");
    expect(log).toEqual(["chime", "speak:Filipino:Numero D, sero, isa, dalawa, sa Counter 2."]);
    expect(document.querySelector('[aria-live="assertive"]')).toHaveTextContent("Numero D, sero, isa, dalawa, sa Counter 2.");
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByTestId("call-banner").className).not.toContain("animate-call");
    push({ event: { type: "queue:called", payload: called({ version: 7, callCount: 2 }) } });
    await flush();
    expect(deps.playChime).toHaveBeenCalledTimes(2);
  });

  it("speaks English but shows the Filipino sentence when the TV has no Filipino voice", async () => {
    const { deps, log } = fakeDeps([{ lang: "en-US", name: "English" }]);
    startDisplay("Filipino", deps);
    push({ event: { type: "queue:called", payload: called() } });
    await flush();
    expect(log).toEqual(["chime", "speak:English:Now serving D, zero, one, two, at Counter 2."]);
    expect(document.querySelector('[aria-live="assertive"]')).toHaveTextContent("Numero D, sero, isa, dalawa, sa Counter 2.");
  });

  it("pauses after 30 quiet minutes, resets on a change and resumes on a tap", () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { deps } = fakeDeps();
    startDisplay("English", deps);
    act(() => vi.advanceTimersByTime(29 * 60_000));
    push({ event: { type: "queue:changed", payload: snapshot({ version: 6 }) } });
    act(() => vi.advanceTimersByTime(29 * 60_000));
    expect(screen.queryByRole("button", { name: "Display paused. Tap to resume" })).not.toBeInTheDocument();
    expect(h.close).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("button", { name: "Display paused. Tap to resume" })).toBeInTheDocument();
    expect(h.close).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Display paused. Tap to resume" }));
    expect(h.reconnect).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Display paused. Tap to resume" })).not.toBeInTheDocument();
  });

  it("says when it is reconnecting and when the demo has ended", () => {
    const { deps } = fakeDeps();
    startDisplay("English", deps);
    push({ status: "reconnecting" });
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
    push({ status: "ended" });
    expect(screen.getByRole("link", { name: /./ })).toHaveAttribute("href", "/");
  });
});
