import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { Server, ServerOptions } from "socket.io";
import { CLOCK, type Clock } from "../common/clock.js";
import type { SocketClaims } from "../common/socket-hub.js";
import type { Config } from "../config/config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UsedJtiStore, verifySocketTicket } from "./socket-tickets.js";

const MAX_MESSAGE_BYTES = 16 * 1024;

const refuse = (message: "forbidden_origin" | "unauthorized" | "session_expired") =>
  Object.assign(new Error(message), { data: { code: message } });

/**
 * Socket.io on the API's own HTTP server (spec 7.3, 13): CORS and an Origin check for the site only, 16 KB messages,
 * and a handshake that needs a valid, unused socket ticket for a barangay that still exists. The ticket's rooms
 * become the socket's data; the gateway joins them.
 */
export class BqIoAdapter extends IoAdapter {
  constructor(
    private readonly appContext: INestApplicationContext,
    private readonly config: Config,
  ) {
    super(appContext);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, {
      ...options,
      path: "/socket.io",
      serveClient: false,
      cors: { origin: this.config.SITE_ORIGIN },
      maxHttpBufferSize: MAX_MESSAGE_BYTES,
    } as ServerOptions);
    const used = this.appContext.get(UsedJtiStore);
    const db = this.appContext.get(PrismaService);
    const clock = this.appContext.get<Clock>(CLOCK);
    server.use(async (socket, next) => {
      if (socket.handshake.headers.origin !== this.config.SITE_ORIGIN) return next(refuse("forbidden_origin"));
      const ticket: unknown = socket.handshake.auth?.ticket;
      let claims: SocketClaims;
      try {
        if (typeof ticket !== "string") throw new Error("missing ticket");
        claims = await verifySocketTicket(ticket, this.config.SOCKET_TICKET_SECRET, used, clock.now());
      } catch {
        return next(refuse("unauthorized"));
      }
      const barangay = await db.barangay.findUnique({ where: { id: claims.brgy }, select: { expiresAt: true } });
      if (!barangay || barangay.expiresAt <= clock.now()) return next(refuse("session_expired"));
      socket.data = claims;
      next();
    });
    return server;
  }
}
