"use client";

import type { QueueSnapshot, SocketTicketResult, TicketUpdate, TicketView } from "@bq/shared";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { clearSession, refreshSession } from "@/lib/auth/session";
import { type ConnectionStatus, connectRealtime, type RealtimeEvent, SOCKET_URL } from "./connection";
import { applyCalled, applySnapshot, initialQueueStore, type QueueStore } from "./queueStore";

type Channel = {
  getTicket: () => Promise<SocketTicketResult>;
  readState: () => Promise<QueueSnapshot>;
  onEvent?: (e: RealtimeEvent) => void;
};

/**
 * One Socket.io connection with the queue store: snapshots replace it, a call that skips a version triggers
 * GET /api/queue/state, and every (re)connect resyncs (spec 8.3).
 */
function useChannel(channel: Channel | null): { store: QueueStore; status: ConnectionStatus; reconnect: () => void; close: () => void } {
  const [store, setStore] = useState<QueueStore>(initialQueueStore);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [generation, setGeneration] = useState(0);
  const latest = useRef(channel);
  const connection = useRef<{ close(): void } | null>(null);
  useEffect(() => {
    latest.current = channel;
  });
  const enabled = channel !== null;

  useEffect(() => {
    if (!enabled) return;
    const resync = () =>
      latest.current
        ?.readState()
        .then((snap) => setStore((s) => applySnapshot(s, snap)))
        .catch(() => undefined);
    connection.current = connectRealtime({
      url: SOCKET_URL,
      getTicket: () => latest.current!.getTicket(),
      onStatus: setStatus,
      onConnect: () => void resync(),
      onEvent: (e) => {
        if (e.type === "queue:state" || e.type === "queue:changed") setStore((s) => applySnapshot(s, e.payload));
        else if (e.type === "queue:called") {
          setStore((s) => {
            const next = applyCalled(s, e.payload);
            if (next.needsResync && !s.needsResync) void resync();
            return next;
          });
        }
        latest.current?.onEvent?.(e);
      },
    });
    return () => connection.current?.close();
  }, [enabled, generation]);

  const close = useCallback(() => {
    connection.current?.close();
    setStatus("paused");
  }, []);
  const reconnect = useCallback(() => setGeneration((g) => g + 1), []);
  return { store, status, reconnect, close };
}

const ticketVersions = new Map<string, number>();

/** Merges a ticket:updated into the cached "My tickets", ignoring updates older than what is shown. */
export function mergeTicketUpdate(client: QueryClient, u: TicketUpdate): void {
  if ((ticketVersions.get(u.ticketId) ?? -1) > u.version) return;
  ticketVersions.set(u.ticketId, u.version);
  client.setQueryData<TicketView[]>(["tickets", "mine"], (list) =>
    list?.map((t) =>
      t.id === u.ticketId
        ? { ...t, status: u.status, ahead: u.ahead, etaMinutes: u.etaMinutes, counterName: u.counterName, callCount: u.callCount, rejoined: u.rejoined }
        : t,
    ),
  );
}

type RealtimeValue = { store: QueueStore; status: ConnectionStatus };
const RealtimeContext = createContext<RealtimeValue>({ store: initialQueueStore, status: "connecting" });

/** One connection per signed-in tab; routes events to the queue store and the TanStack Query cache. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const router = useRouter();
  const { store, status } = useChannel({
    getTicket: () => api<SocketTicketResult>("/api/realtime/ticket", { method: "POST" }),
    readState: () => api<QueueSnapshot>("/api/queue/state"),
    onEvent: (e) => {
      if (e.type === "ticket:updated") mergeTicketUpdate(client, e.payload);
      else if (e.type === "request:created") void client.invalidateQueries({ queryKey: ["requests"] });
      else if (e.type === "request:updated") {
        void client.invalidateQueries({ queryKey: ["requests"] });
        void client.invalidateQueries({ queryKey: ["request", e.payload.requestId] });
      } else if (e.type === "session:revoked") {
        // The API tells every socket of the user, but only one device may have signed out (switching roles on the
        // laptop, while the phone that joined by QR keeps its own session). A device whose session still refreshes
        // stays; one that was revoked too (deactivation) is signed out (final review 3).
        // refreshSession clears the session itself; an ended demo shows the shell's "ended" page.
        void refreshSession().then((result) => {
          if (result === "signed-out") router.replace("/login");
        });
      }
    },
  });
  useEffect(() => {
    if (status === "ended") clearSession("ended");
    if (status === "live") {
      // After a reconnect anything may have changed while the phone slept.
      void client.invalidateQueries({ queryKey: ["tickets", "mine"] });
      void client.invalidateQueries({ queryKey: ["requests"] });
    }
  }, [status, client]);
  return <RealtimeContext.Provider value={{ store, status }}>{children}</RealtimeContext.Provider>;
}

export function useQueue(): RealtimeValue {
  return useContext(RealtimeContext);
}

/** Today's tickets of the signed-in resident, kept live by ticket:updated. */
export function useMyTickets() {
  const query = useQuery({ queryKey: ["tickets", "mine"], queryFn: () => api<TicketView[]>("/api/queue/tickets/mine") });
  return { tickets: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch };
}

/** The TV and the kiosk: their own connection with the key from the link's fragment (spec 7.3). */
export function useKeyQueue(kind: "display" | "kiosk", key: string | null, onEvent?: (e: RealtimeEvent) => void) {
  return useChannel(
    key
      ? {
          getTicket: () => api<SocketTicketResult>(`/api/realtime/${kind}-ticket`, { method: "POST", json: { key }, auth: false }),
          readState: () => api<QueueSnapshot>("/api/queue/state", { auth: false, headers: { [`x-${kind}-key`]: key } }),
          onEvent,
        }
      : null,
  );
}

/** A kiosk ticket's tracker page: only that ticket's updates. */
export function useTracker(token: string | null): { update: TicketUpdate | null; status: ConnectionStatus } {
  const [update, setUpdate] = useState<TicketUpdate | null>(null);
  const { status } = useChannel(
    token
      ? {
          getTicket: () => api<SocketTicketResult>("/api/realtime/tracker-ticket", { method: "POST", json: { token }, auth: false }),
          // A tracker joins only its ticket's room; the ticket update sent on every join is its resync.
          readState: () => new Promise<QueueSnapshot>(() => undefined),
          onEvent: (e) => {
            if (e.type === "ticket:updated") setUpdate((u) => (u && u.version > e.payload.version ? u : e.payload));
          },
        }
      : null,
  );
  return { update, status };
}
