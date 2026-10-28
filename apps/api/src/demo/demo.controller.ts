import { timingSafeEqual } from "node:crypto";
import { Body, Controller, Headers, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { type DemoStartResult, JoinInput, type JoinCodeResult } from "@bq/shared";
import type { Request, Response } from "express";
import { sendSession } from "../auth/auth.controller.js";
import { CurrentUser } from "../auth/decorators.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { AuthUser } from "../auth/subjects.js";
import { AppError } from "../common/app-error.js";
import { clientIp } from "../common/http-middleware.js";
import { ZodPipe } from "../common/pipes.js";
import { CONFIG, type Config } from "../config/config.js";
import { DemoService } from "./demo.service.js";

@Controller("demo")
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post()
  async create(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<DemoStartResult> {
    const created = await this.demo.create(clientIp(req));
    sendSession(res, created);
    // The refresh token stays in the cookie only.
    const { refreshToken: _token, refreshExpiresAt: _expires, ...result } = created;
    return result;
  }

  @Post("join")
  @HttpCode(200)
  async join(@Body(new ZodPipe(JoinInput)) input: JoinInput, @Res({ passthrough: true }) res: Response) {
    return sendSession(res, await this.demo.join(input.code));
  }

  @Post("join-code")
  @UseGuards(JwtAuthGuard)
  joinCode(@CurrentUser() user: AuthUser): Promise<JoinCodeResult> {
    return this.demo.newJoinCode(user.barangayId);
  }
}

@Controller("admin")
export class AdminController {
  constructor(
    private readonly demo: DemoService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Called daily by GitHub Actions through Netlify; the secret header shows it is that job. */
  @Post("cleanup")
  @HttpCode(200)
  cleanup(@Headers("x-cleanup-secret") secret: string | undefined): Promise<{ deleted: number }> {
    const expected = Buffer.from(this.config.CLEANUP_SECRET);
    const given = Buffer.from(secret ?? "");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new AppError("forbidden");
    return this.demo.cleanup();
  }
}
