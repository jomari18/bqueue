import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { type QueueSnapshot, TakeTicketInput, type TakeTicketResult, TicketsQuery, type TicketView } from "@bq/shared";
import type { Response } from "express";
import { CurrentSubject, CurrentUser, Roles } from "../auth/decorators.js";
import { QueueReaderGuard } from "../auth/key.guard.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { RolesGuard } from "../auth/roles.guard.js";
import type { AuthUser, Subject } from "../auth/subjects.js";
import { UuidPipe, ZodPipe } from "../common/pipes.js";
import { residentActorFor } from "../documents/resident-actor.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { QueueService } from "./queue.service.js";

/** GET /api/queue/state: residents, staff, the kapitan, TV displays and kiosks may all watch the queue. */
@Controller("queue")
export class QueueStateController {
  constructor(private readonly queue: QueueService) {}

  @Get("state")
  @UseGuards(QueueReaderGuard)
  state(@CurrentSubject() subject: Subject): Promise<QueueSnapshot> {
    return this.queue.state(subject.barangayId);
  }
}

@Controller("queue")
@UseGuards(JwtAuthGuard, RolesGuard)
export class QueueController {
  constructor(
    private readonly queue: QueueService,
    private readonly db: PrismaService,
  ) {}

  @Post("tickets")
  @Roles("RESIDENT")
  async take(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(TakeTicketInput)) input: TakeTicketInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TakeTicketResult> {
    const actor = await residentActorFor(this.db, user.barangayId, user);
    const { ticket, duplicate } = await this.queue.takeTicket(user.barangayId, { kind: "resident", ...actor }, input);
    res.status(duplicate ? 200 : 201);
    return { ticket, duplicate };
  }

  @Get("tickets/mine")
  @Roles("RESIDENT")
  mine(@CurrentUser() user: AuthUser): Promise<TicketView[]> {
    return this.queue.todaysTickets(user.barangayId, { residentUserId: user.userId });
  }

  @Get("tickets")
  @Roles("STAFF", "KAPITAN")
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(TicketsQuery)) query: TicketsQuery): Promise<TicketView[]> {
    return this.queue.todaysTickets(user.barangayId, { status: query.status });
  }

  @Post("tickets/:id/call-again")
  @HttpCode(200)
  @Roles("STAFF", "KAPITAN")
  async callAgain(@CurrentUser() user: AuthUser, @Param("id", UuidPipe) id: string): Promise<{ ticket: TicketView }> {
    return { ticket: await this.queue.callAgain(user.barangayId, user, id) };
  }

  @Post("tickets/:id/served")
  @HttpCode(200)
  @Roles("STAFF", "KAPITAN")
  async served(@CurrentUser() user: AuthUser, @Param("id", UuidPipe) id: string): Promise<{ ticket: TicketView }> {
    return { ticket: await this.queue.finish(user.barangayId, user, id, "SERVED") };
  }

  @Post("tickets/:id/missed")
  @HttpCode(200)
  @Roles("STAFF", "KAPITAN")
  async missed(@CurrentUser() user: AuthUser, @Param("id", UuidPipe) id: string): Promise<{ ticket: TicketView }> {
    return { ticket: await this.queue.finish(user.barangayId, user, id, "MISSED") };
  }

  @Post("tickets/:id/rejoin")
  @HttpCode(200)
  @Roles("RESIDENT", "STAFF", "KAPITAN")
  async rejoin(@CurrentUser() user: AuthUser, @Param("id", UuidPipe) id: string): Promise<{ ticket: TicketView }> {
    return { ticket: await this.queue.rejoin(user.barangayId, user, id) };
  }
}
