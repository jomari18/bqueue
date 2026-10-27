import { Inject, Logger } from "@nestjs/common";
import { type OnGatewayConnection, type OnGatewayDisconnect, type OnGatewayInit, WebSocketGateway } from "@nestjs/websockets";
import { manilaDate } from "@bq/shared";
import type { Server, Socket } from "socket.io";
import { CLOCK, type Clock } from "../common/clock.js";
import { PresenceTracker } from "../common/presence.js";
import { type SocketClaims, SocketHub } from "../common/socket-hub.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { queueSnapshot, ticketUpdates } from "../queue/read-model.js";

/**
 * Server-to-client only (spec 8.2): there are no message handlers, so nothing a client sends reaches anyone.
 * On connection the socket joins the rooms its ticket names and gets the current state, so a reconnect is a resync.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger("RealtimeGateway");

  constructor(
    private readonly hub: SocketHub,
    private readonly presence: PresenceTracker,
    private readonly db: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  afterInit(server: Server): void {
    this.hub.bind(server);
  }

  async handleConnection(socket: Socket): Promise<void> {
    const claims = socket.data as SocketClaims;
    await socket.join(claims.rooms);
    this.presence.connected(claims.brgy);
    try {
      const today = manilaDate(this.clock.now());
      if (claims.rooms.includes(`b:${claims.brgy}:public`)) {
        socket.emit("queue:state", await queueSnapshot(this.db, claims.brgy, today));
      }
      const mine = claims.rooms.filter((r) => r.startsWith("u:") || r.startsWith("t:"));
      if (mine.length > 0) {
        for (const { room, update } of await ticketUpdates(this.db, claims.brgy, today)) {
          if (room && mine.includes(room)) socket.emit("ticket:updated", update);
        }
      }
    } catch (err) {
      this.logger.warn(`state on connect failed: ${(err as Error).name}`);
    }
  }

  handleDisconnect(socket: Socket): void {
    const claims = socket.data as SocketClaims | undefined;
    if (claims?.brgy) this.presence.disconnected(claims.brgy);
  }
}
