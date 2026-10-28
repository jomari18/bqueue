import { createHash, randomBytes } from "node:crypto";
import { ROLES } from "@bq/shared";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { AppError } from "../common/app-error.js";
import type { AuthUser } from "./subjects.js";

const ACCESS_TOKEN_SECONDS = 15 * 60;
const Claims = z.object({ sub: z.uuid(), brgy: z.uuid(), role: z.enum(ROLES) });
const key = (secret: string) => new TextEncoder().encode(secret);

/** Access token (spec 7.2): HS256, 15 minutes, claims `sub`, `brgy` and `role`. */
export function signAccessToken(user: AuthUser, secret: string, now: Date): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ brgy: user.barangayId, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_SECONDS)
    .sign(key(secret));
}

/** Any bad, expired or foreign token answers 401 unauthenticated, so the web app refreshes or signs in again. */
export async function verifyAccessToken(token: string, secret: string, now: Date): Promise<AuthUser> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"], currentDate: now });
    const claims = Claims.parse(payload);
    return { kind: "user", userId: claims.sub, barangayId: claims.brgy, role: claims.role };
  } catch {
    throw new AppError("unauthenticated");
  }
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Random bytes as base64url, with the SHA-256 hash that is stored instead (refresh tokens, keys, codes). */
export function newOpaqueToken(bytes = 32): { token: string; hash: string } {
  const token = randomBytes(bytes).toString("base64url");
  return { token, hash: sha256Hex(token) };
}
