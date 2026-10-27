import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AppError } from "../common/app-error.js";
import { CLOCK, type Clock } from "../common/clock.js";
import { CONFIG, type Config } from "../config/config.js";
import type { Subject } from "./subjects.js";
import { verifyAccessToken } from "./tokens.js";

/** Requires `Authorization: Bearer <access token>` and puts the user on `req.subject`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { subject?: Subject }>();
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) throw new AppError("unauthenticated");
    req.subject = await verifyAccessToken(header.slice(7), this.config.JWT_SECRET, this.clock.now());
    return true;
  }
}
