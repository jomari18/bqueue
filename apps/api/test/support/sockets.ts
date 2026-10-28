import { io, type Socket } from "socket.io-client";
import type { TestApp } from "./app.js";
import { testEnv } from "./env.js";

/** A Socket.io client as a browser on the site would connect: WebSocket, the site's Origin and a ticket. */
export function connectSocket(t: TestApp, ticket: string | undefined, opts: { origin?: string } = {}): Promise<Socket> {
  const socket = io(t.url!, {
    transports: ["websocket"],
    reconnection: false,
    auth: ticket ? { ticket } : {},
    extraHeaders: { origin: opts.origin ?? testEnv.SITE_ORIGIN },
  });
  // Recorded from the start, so events sent right on connection (queue:state) are never missed.
  const seen: { event: string; payload: unknown }[] = [];
  socket.onAny((event: string, payload: unknown) => seen.push({ event, payload }));
  seenBySocket.set(socket, seen);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => {
      socket.close();
      reject(err);
    });
  });
}

const seenBySocket = new WeakMap<Socket, { event: string; payload: unknown }[]>();

/** Every event a socket from connectSocket has received since it was created. */
export function seenOf(socket: Socket): { event: string; payload: unknown }[] {
  return seenBySocket.get(socket) ?? [];
}

/** The next event of a name, or a timeout error. */
export function nextEvent<T = unknown>(socket: Socket, event: string, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Collects every event a socket receives, for "received nothing" checks. */
export function recordEvents(socket: Socket): { event: string; payload: unknown }[] {
  const seen: { event: string; payload: unknown }[] = [];
  socket.onAny((event: string, payload: unknown) => seen.push({ event, payload }));
  return seen;
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
