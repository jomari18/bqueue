import { randomUUID } from "node:crypto";
import { ROLES } from "@bq/shared";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { AppError } from "../common/app-error.js";
import type { SocketClaims } from "../common/socket-hub.js";

// Socket tickets (spec 7.3): the browser asks the API, through the signed proxy, for a 60-second single-use JWT
// naming the rooms the server allows. Sockets connect straight to Render with it; a browser never picks rooms.

const ISSUER = "bqueue-api";
const AUDIENCE = "bq-socket";
const LIFETIME_SECONDS = 60;
const key = (secret: string) => new TextEncoder().encode(secret);

const Claims = z.object({
  kind: z.enum(["user", "display", "kiosk", "tracker"]),
  brgy: z.uuid(),
  sub: z.string().min(1),
  role: z.enum(ROLES).optional(),
  rooms: z.array(z.string()),
  jti: z.string(),
  exp: z.number(),
});

/** The rooms a subject may join; the server decides them, never the browser. */
export function roomsFor(claims: Omit<SocketClaims, "rooms">): string[] {
  const pub = `b:${claims.brgy}:public`;
  switch (claims.kind) {
    case "user":
      return claims.role === "RESIDENT" ? [pub, `u:${claims.sub}`] : [pub, `b:${claims.brgy}:staff`, `u:${claims.sub}`];
    case "display":
    case "kiosk":
      return [pub];
    case "tracker":
      return [`t:${claims.sub}`];
  }
}

export function issueSocketTicket(claims: SocketClaims, secret: string, now: Date): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ kind: claims.kind, brgy: claims.brgy, rooms: claims.rooms, ...(claims.role ? { role: claims.role } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.sub)
    .setJti(randomUUID())
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + LIFETIME_SECONDS)
    .sign(key(secret));
}

/** Remembers used ticket ids until they expire; the API runs as a single instance. */
export class UsedJtiStore {
  private readonly used = new Map<string, number>();

  /** False when the ticket was already used. */
  markUsed(jti: string, expiresAtMs: number, nowMs: number): boolean {
    for (const [id, exp] of this.used) if (exp <= nowMs) this.used.delete(id);
    if (this.used.has(jti)) return false;
    this.used.set(jti, expiresAtMs);
    return true;
  }
}

export async function verifySocketTicket(ticket: string, secret: string, used: UsedJtiStore, now: Date): Promise<SocketClaims> {
  try {
    const { payload } = await jwtVerify(ticket, key(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: now,
    });
    const c = Claims.parse(payload);
    if (!used.markUsed(c.jti, c.exp * 1000, now.getTime())) throw new Error("ticket reused");
    return { kind: c.kind, brgy: c.brgy, sub: c.sub, ...(c.role ? { role: c.role } : {}), rooms: c.rooms };
  } catch {
    throw new AppError("unauthenticated");
  }
}
