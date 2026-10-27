import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "../src/auth/hashing.js";
import { newOpaqueToken, sha256Hex, signAccessToken, verifyAccessToken } from "../src/auth/tokens.js";

const SECRET = "test-jwt-secret-0123456789abcdefghij";
const user = {
  kind: "user" as const,
  userId: "6b0f4f0c-3f1e-4f6a-9d2b-1c2d3e4f5a6b",
  barangayId: "7c1a5b2d-4e3f-4a5b-8c6d-2e3f4a5b6c7d",
  role: "STAFF" as const,
};

describe("hashing and tokens", () => {
  it("hashes secrets with argon2id", async () => {
    const hash = await hashSecret("482915");
    expect(await verifySecret(hash, "482915")).toBe(true);
    expect(await verifySecret(hash, "482916")).toBe(false);
  });

  it("round-trips an access token for 15 minutes only", async () => {
    const now = new Date("2026-10-28T02:00:00Z");
    const token = await signAccessToken(user, SECRET, now);
    expect(await verifyAccessToken(token, SECRET, now)).toEqual(user);
    await expect(verifyAccessToken(token, SECRET, new Date(now.getTime() + 15 * 60_000 + 1000))).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await expect(verifyAccessToken(token, "another-secret-0123456789abcdefghijkl", now)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("makes opaque tokens and keeps only their hash", () => {
    const { token, hash } = newOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256Hex(token)).toBe(hash);
    expect(newOpaqueToken(16).token).toHaveLength(22);
  });
});
