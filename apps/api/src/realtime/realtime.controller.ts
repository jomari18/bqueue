import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { KeyInput, type SocketTicketResult, TrackerInput } from "@bq/shared";
import { CurrentUser } from "../auth/decorators.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { KeysService } from "../auth/keys.service.js";
import type { AuthUser } from "../auth/subjects.js";
import { AppError } from "../common/app-error.js";
import { CLOCK, type Clock } from "../common/clock.js";
import { ZodPipe } from "../common/pipes.js";
import type { SocketClaims } from "../common/socket-hub.js";
import { CONFIG, type Config } from "../config/config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { findTicketByTrackingToken } from "../queue/tracking.js";
import { issueSocketTicket, roomsFor } from "./socket-tickets.js";

/** Socket tickets for signed-in people, TV displays, kiosks and kiosk-ticket trackers (spec 9.5). */
@Controller("realtime")
export class RealtimeController {
  constructor(
    private readonly db: PrismaService,
    private readonly keys: KeysService,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Post("ticket")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async user(@CurrentUser() user: AuthUser): Promise<SocketTicketResult> {
    const barangay = await this.db.barangay.findUnique({ where: { id: user.barangayId }, select: { expiresAt: true } });
    if (!barangay) throw new AppError("unauthenticated");
    if (barangay.expiresAt <= this.clock.now()) throw new AppError("session_expired");
    return this.ticket({ kind: "user", brgy: user.barangayId, sub: user.userId, role: user.role });
  }

  @Post("display-ticket")
  @HttpCode(200)
  async display(@Body(new ZodPipe(KeyInput)) input: KeyInput): Promise<SocketTicketResult> {
    const subject = await this.keys.subjectForKey("display", input.key);
    return this.ticket({ kind: "display", brgy: subject.barangayId, sub: "display" });
  }

  @Post("kiosk-ticket")
  @HttpCode(200)
  async kiosk(@Body(new ZodPipe(KeyInput)) input: KeyInput): Promise<SocketTicketResult> {
    const subject = await this.keys.subjectForKey("kiosk", input.key);
    return this.ticket({ kind: "kiosk", brgy: subject.barangayId, sub: "kiosk" });
  }

  @Post("tracker-ticket")
  @HttpCode(200)
  async tracker(@Body(new ZodPipe(TrackerInput)) input: TrackerInput): Promise<SocketTicketResult> {
    const found = await findTicketByTrackingToken(this.db, input.token);
    if (!found) throw new AppError("unauthenticated");
    if (found.expiresAt <= this.clock.now()) throw new AppError("session_expired");
    return this.ticket({ kind: "tracker", brgy: found.barangayId, sub: found.ticketId });
  }

  private async ticket(claims: Omit<SocketClaims, "rooms">): Promise<SocketTicketResult> {
    const ticket = await issueSocketTicket({ ...claims, rooms: roomsFor(claims) }, this.config.SOCKET_TICKET_SECRET, this.clock.now());
    return { ticket, url: this.config.PUBLIC_URL, expiresIn: 60 };
  }
}
