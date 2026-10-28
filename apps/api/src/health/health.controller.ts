import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import { CONFIG, type Config } from "../config/config.js";

/** The landing page calls this directly to wake the free Render instance, so it allows the site's origin. */
@Controller("health")
export class HealthController {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Get()
  health(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.setHeader("Access-Control-Allow-Origin", this.config.SITE_ORIGIN);
    res.setHeader("Vary", "Origin");
    return { ok: true };
  }
}
