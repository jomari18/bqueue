import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { type RequestSummary, RequestsQuery, type RequestView, SubmitRequestInput } from "@bq/shared";
import type { Response } from "express";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { RolesGuard } from "../auth/roles.guard.js";
import type { AuthUser } from "../auth/subjects.js";
import { UuidPipe, ZodPipe } from "../common/pipes.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RequestsService } from "./requests.service.js";
import { residentActorFor } from "./resident-actor.js";

@Controller("requests")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly db: PrismaService,
  ) {}

  @Post()
  @Roles("RESIDENT")
  async submit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(SubmitRequestInput)) input: SubmitRequestInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actor = await residentActorFor(this.db, user.barangayId, user);
    const result = await this.requests.submit(user.barangayId, actor, input);
    res.status(result.duplicate ? 200 : 201);
    return result;
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(RequestsQuery)) query: RequestsQuery): Promise<RequestSummary[]> {
    return this.requests.list(user.barangayId, user, query);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id", UuidPipe) id: string): Promise<RequestView> {
    return this.requests.get(user.barangayId, user, id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @Roles("RESIDENT")
  cancel(@CurrentUser() user: AuthUser, @Param("id", UuidPipe) id: string): Promise<RequestView> {
    return this.requests.transition(user.barangayId, user, id, { action: "cancel" });
  }
}
