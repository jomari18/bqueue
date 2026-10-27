import { Body, Controller, Post, Res, UseGuards } from "@nestjs/common";
import { TakeTicketInput, type TakeTicketResult } from "@bq/shared";
import type { Response } from "express";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { RolesGuard } from "../auth/roles.guard.js";
import type { AuthUser } from "../auth/subjects.js";
import { ZodPipe } from "../common/pipes.js";
import { residentActorFor } from "../documents/resident-actor.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { QueueService } from "./queue.service.js";

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
}
