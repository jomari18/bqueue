import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { Logger } from "pino";
import { sha256Hex } from "./auth/tokens.js";
import { ErrorFilter } from "./common/error.filter.js";
import { jsonBody, proxySignature, requestLog } from "./common/http-middleware.js";
import type { Config } from "./config/config.js";
import { limiter, loginLimiter } from "./common/rate-limit.js";

/**
 * Shared by main.ts and the tests. The order matters: the proxy signature is checked before the body is read
 * and before any rate limiter counts the request, so unsigned callers cannot spend a visitor's limits.
 */
export function configureApp(app: NestExpressApplication, config: Config, logger: Logger): void {
  app.setGlobalPrefix("api");
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cookieParser());
  app.use(requestLog(logger));
  app.use(proxySignature(config.PROXY_SIGNING_SECRET));
  app.use(jsonBody());
  app.use("/api/auth/login", loginLimiter());
  app.use("/api/demo/join", limiter({ windowMs: 60_000, limit: 10 }));
  app.use("/api/verify", limiter({ windowMs: 60_000, limit: 30 }));
  // 10 walk-in tickets a minute per kiosk key, which is one per barangay (spec 6.8).
  app.use("/api/kiosk/tickets", limiter({ windowMs: 60_000, limit: 10, key: (req) => sha256Hex(req.header("x-kiosk-key") ?? "none") }));
  app.useGlobalFilters(new ErrorFilter(logger));
}
