import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/lib/api/client";
import { connectRealtime } from "../src/lib/realtime/connection";

type Handler = (...args: unknown[]) => void;
const fake = vi.hoisted(() => ({
  opts: null as null | { auth: (cb: (data: object) => void) => void },
  handlers: new Map<string, Handler[]>(),
  disconnect: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("socket.io-client", () => ({
  io: (_url: string, opts: typeof fake.opts) => {
    fake.opts = opts;
    return {
      on: (event: string, h: Handler) => fake.handlers.set(event, [...(fake.handlers.get(event) ?? []), h]),
      onAny: () => undefined,
      disconnect: fake.disconnect,
      connect: fake.connect,
    };
  },
}));

const fire = (event: string, ...args: unknown[]) => fake.handlers.get(event)?.forEach((h) => h(...args));
/** One connection attempt: Socket.io asks for the auth data (a fresh ticket), then connects. */
async function attempt() {
  const data = await new Promise<object>((resolve) => fake.opts!.auth(resolve));
  if ("ticket" in data) fire("connect");
}

describe("real-time connection", () => {
  beforeEach(() => {
    fake.handlers.clear();
    fake.disconnect.mockClear();
  });

  it("fetches a new ticket and resyncs on every connect", async () => {
    const getTicket = vi.fn(async () => ({ ticket: "t", url: "http://api", expiresIn: 60 as const }));
    const onConnect = vi.fn();
    const statuses: string[] = [];
    connectRealtime({ url: "http://api", getTicket, onEvent: vi.fn(), onStatus: (s) => statuses.push(s), onConnect });
    await attempt();
    fire("disconnect", "transport close");
    await attempt();
    expect(getTicket).toHaveBeenCalledTimes(2);
    expect(onConnect).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual(["connecting", "live", "reconnecting", "live"]);
  });

  it("stops for good when the demo barangay has ended", async () => {
    const statuses: string[] = [];
    connectRealtime({
      url: "http://api",
      getTicket: async () => ({ ticket: "t", url: "", expiresIn: 60 }),
      onEvent: vi.fn(),
      onStatus: (s) => statuses.push(s),
      onConnect: vi.fn(),
    });
    fire("connect_error", new Error("session_expired"));
    expect(statuses.at(-1)).toBe("ended");
    expect(fake.disconnect).toHaveBeenCalled();
  });

  it("stops when the ticket request says the barangay has ended", async () => {
    const statuses: string[] = [];
    connectRealtime({
      url: "http://api",
      getTicket: async () => {
        throw new ApiError("session_expired", 401, "ended");
      },
      onEvent: vi.fn(),
      onStatus: (s) => statuses.push(s),
      onConnect: vi.fn(),
    });
    fake.opts!.auth(() => undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(statuses.at(-1)).toBe("ended");
  });

  it("passes server events on", () => {
    const onEvent = vi.fn();
    connectRealtime({ url: "http://api", getTicket: vi.fn(), onEvent, onStatus: vi.fn(), onConnect: vi.fn() });
    fire("queue:called", { code: "D-012" });
    fire("session:revoked", {});
    expect(onEvent).toHaveBeenCalledWith({ type: "queue:called", payload: { code: "D-012" } });
    expect(onEvent).toHaveBeenCalledWith({ type: "session:revoked", payload: {} });
  });
});
