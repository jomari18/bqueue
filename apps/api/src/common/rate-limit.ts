import type { Bilingual } from "@bq/shared";
import type { Request, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit, type RateLimitInfo } from "express-rate-limit";
import { AppError } from "./app-error.js";
import { clientIp } from "./http-middleware.js";
import { sendError } from "./send-error.js";

type Limit = { windowMs: number; limit: number; message?: Bilingual; key?: (req: Request) => string };

/**
 * A fixed-window limit with draft-8 RateLimit headers (spec 9.8). Counts live in memory because the API runs as one
 * instance. The default key is the visitor's IP from Netlify's signed proxy, grouped by /56 for IPv6.
 */
export function limiter({ windowMs, limit, message, key }: Limit): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: key ?? ((req) => ipKeyGenerator(clientIp(req))),
    validate: { trustProxy: false, xForwardedForHeader: false, forwardedHeader: false },
    handler: (req, res) => {
      const resetTime = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit?.resetTime;
      sendError(req, res, new AppError("rate_limited", { message, retryAfter: resetTime }));
    },
  });
}

/** Spec 9.8: 20 sign-in requests per IP per 15 minutes, whatever the username. */
export const loginLimiter = () =>
  limiter({
    windowMs: 15 * 60_000,
    limit: 20,
    message: {
      en: "Too many sign-in attempts from this network. Please wait a few minutes and try again.",
      fil: "Sobrang daming subok mag-sign in mula sa network na ito. Maghintay ng ilang minuto at subukan ulit.",
    },
  });
