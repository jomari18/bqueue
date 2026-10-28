import express, { type Request, type RequestHandler } from "express";
import { jwtVerify } from "jose";
import type { Logger } from "pino";
import { AppError } from "./app-error.js";
import { sendError } from "./send-error.js";

// Express middleware that runs before Nest's router. Nest filters do not see these, so they answer with sendError.

const isHealth = (req: Request) =>
  req.path === "/api/health" && (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS");

/**
 * Netlify signs every proxied request with an HS256 JWS in `x-nf-sign` (spec 4). Requiring it means nobody can
 * call the Render service directly, so headers such as the client IP can be trusted. Only health is open.
 */
export function proxySignature(secret: string): RequestHandler {
  const key = new TextEncoder().encode(secret);
  return async (req, res, next) => {
    if (isHealth(req)) return next();
    const token = req.header("x-nf-sign");
    try {
      if (!token) throw new Error("missing signature");
      await jwtVerify(token, key, { algorithms: ["HS256"], issuer: "netlify" });
      next();
    } catch {
      sendError(req, res, new AppError("bad_proxy_signature"));
    }
  };
}

/**
 * The visitor's IP. Only meaningful after `proxySignature`, because the header comes from Netlify.
 * X-Forwarded-For is not read: its leftmost entry is whatever the caller wrote.
 */
export function clientIp(req: Pick<Request, "headers" | "socket">): string {
  const netlify = req.headers["x-nf-client-connection-ip"];
  if (typeof netlify === "string" && netlify.trim()) return netlify.trim();
  return req.socket.remoteAddress ?? "unknown";
}

/** JSON bodies up to 32 KB (spec 13); anything unreadable or larger is 400 invalid_input. */
export function jsonBody(limitBytes = 32_768): RequestHandler {
  const parse = express.json({ limit: limitBytes });
  return (req, res, next) =>
    parse(req, res, (err?: unknown) => (err ? sendError(req, res, new AppError("invalid_input")) : next()));
}

/** One line per request: method, path without the query, status and milliseconds. Nothing else (spec 13). */
export function requestLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = performance.now();
    res.on("finish", () => {
      logger.info({
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        ms: Math.round(performance.now() - started),
      });
    });
    next();
  };
}
