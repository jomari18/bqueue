import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { LoginInput, type MeView, type SessionResult } from "@bq/shared";
import type { Request, Response } from "express";
import { AppError } from "../common/app-error.js";
import { ZodPipe } from "../common/pipes.js";
import { AuthService, type SessionWithRefresh } from "./auth.service.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./cookies.js";
import { CurrentUser } from "./decorators.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import type { AuthUser } from "./subjects.js";

/** Sets the cookie and answers without the refresh token, which never leaves the cookie. */
export function sendSession(res: Response, s: SessionWithRefresh): SessionResult {
  setRefreshCookie(res, s.refreshToken, s.refreshExpiresAt);
  return { accessToken: s.accessToken, user: s.user, barangay: s.barangay };
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body(new ZodPipe(LoginInput)) input: LoginInput, @Res({ passthrough: true }) res: Response) {
    return sendSession(res, await this.auth.login(input));
  }

  /** CSRF: the cookie alone is not enough, the header proves the call came from the app's own script. */
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.header("x-requested-with") !== "bqueue") throw new AppError("forbidden");
    try {
      return sendSession(res, await this.auth.refresh(readRefreshCookie(req)));
    } catch (err) {
      // The cookie is cleared only when the session is really over, never on a database or network error.
      if (err instanceof AppError && (err.code === "unauthenticated" || err.code === "session_expired")) {
        clearRefreshCookie(res);
      }
      throw err;
    }
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readRefreshCookie(req));
    clearRefreshCookie(res);
  }
}

@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  me(@CurrentUser() user: AuthUser): Promise<MeView> {
    return this.auth.me(user);
  }
}
