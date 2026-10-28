import type {
  QueueCalledEvent,
  QueueSnapshot,
  RequestSummary,
  RequestUpdatedEvent,
  SocketTicketResult,
  TicketUpdate,
} from "@bq/shared";
import { io } from "socket.io-client";
import { ApiError } from "@/lib/api/client";

// "invalid": the API no longer knows this screen's key or token (rotated, or its demo barangay was deleted).
export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "paused" | "ended" | "invalid";

export type RealtimeEvent =
  | { type: "queue:state" | "queue:changed"; payload: QueueSnapshot }
  | { type: "queue:called"; payload: QueueCalledEvent }
  | { type: "ticket:updated"; payload: TicketUpdate }
  | { type: "request:created"; payload: RequestSummary }
  | { type: "request:updated"; payload: RequestUpdatedEvent }
  | { type: "session:revoked"; payload: unknown };

const EVENTS: RealtimeEvent["type"][] = [
  "queue:state",
  "queue:changed",
  "queue:called",
  "ticket:updated",
  "request:created",
  "request:updated",
  "session:revoked",
];

export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:8080";

/**
 * Socket.io straight to the API (Netlify cannot proxy WebSockets, spec 4). Every connection attempt fetches a fresh
 * 60-second ticket, every connect resyncs, and an ended demo barangay or an unknown key stops the retries for good.
 * A refused handshake leaves Socket.io inactive, so this retries it with backoff (final review 1).
 */
export function connectRealtime(opts: {
  url: string;
  getTicket: () => Promise<SocketTicketResult>;
  onEvent: (e: RealtimeEvent) => void;
  onStatus: (s: ConnectionStatus) => void;
  onConnect: () => void;
}): { close(): void } {
  let stopped = false;
  let refused = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const socket = io(opts.url, {
    transports: ["websocket", "polling"],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    auth: (cb: (data: object) => void) => {
      opts.getTicket().then(
        (t) => cb({ ticket: t.ticket }),
        (err: unknown) => {
          if (err instanceof ApiError && err.code === "session_expired") end("ended");
          // A key or token the API does not know will not start working on a retry.
          else if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) end("invalid");
          else cb({});
        },
      );
    },
  });
  opts.onStatus("connecting");

  function end(status: "ended" | "invalid") {
    stopped = true;
    if (retry) clearTimeout(retry);
    socket.disconnect();
    opts.onStatus(status);
  }

  socket.on("connect", () => {
    refused = 0;
    opts.onStatus("live");
    opts.onConnect();
  });
  socket.on("disconnect", (reason: unknown) => {
    if (stopped) return;
    opts.onStatus("reconnecting");
    // Socket.io does not retry after the server closed the socket (for example a rotated key); try once more,
    // and the next ticket request decides whether this screen may still connect.
    if (reason === "io server disconnect") setTimeout(() => !stopped && socket.connect(), 1000);
  });
  socket.on("connect_error", (err: unknown) => {
    if (err instanceof Error && err.message === "session_expired") return end("ended");
    if (stopped) return;
    opts.onStatus("reconnecting");
    // Socket.io retries transport errors itself, but not a handshake the server refused.
    if (!(socket as { active?: boolean }).active) {
      const delay = Math.min(30_000, 1000 * 2 ** refused++);
      retry = setTimeout(() => !stopped && socket.connect(), delay);
    }
  });
  for (const type of EVENTS) socket.on(type, (payload: unknown) => opts.onEvent({ type, payload } as RealtimeEvent));

  return {
    close() {
      stopped = true;
      if (retry) clearTimeout(retry);
      socket.disconnect();
    },
  };
}
