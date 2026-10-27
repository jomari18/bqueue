import { Injectable } from "@nestjs/common";
import type { Role } from "@bq/shared";
import type { Server } from "socket.io";

/** What every socket carries, from its socket ticket (spec 7.3). */
export type SocketClaims = {
  kind: "user" | "display" | "kiosk" | "tracker";
  brgy: string;
  sub: string;
  role?: Role;
  rooms: string[];
};

/**
 * The one way the API talks to Socket.io. Services emit after their transaction commits; the gateway binds the
 * server at start. Until then (and in tests that do not open sockets) emits do nothing.
 */
@Injectable()
export class SocketHub {
  private server?: Server;

  bind(server: Server): void {
    this.server = server;
  }

  emit(room: string, event: string, payload: unknown): void {
    this.server?.to(room).emit(event, payload);
  }

  /** Disconnects every socket in a room, after an optional last event (for example `session:revoked`). */
  async disconnect(room: string, notice?: { event: string; payload: unknown }): Promise<void> {
    if (!this.server) return;
    if (notice) this.server.to(room).emit(notice.event, notice.payload);
    this.server.in(room).disconnectSockets(true);
  }

  /** Disconnects only the sockets in a room whose ticket kind matches (key rotation, spec 7.3). */
  async disconnectKind(room: string, kind: SocketClaims["kind"]): Promise<void> {
    if (!this.server) return;
    const sockets = await this.server.in(room).fetchSockets();
    for (const s of sockets) if ((s.data as SocketClaims).kind === kind) s.disconnect(true);
  }
}
