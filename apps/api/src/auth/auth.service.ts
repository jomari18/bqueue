import { randomUUID } from "node:crypto";
import type { LoginInput, MeView, SessionResult } from "@bq/shared";
import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/app-error.js";
import { CLOCK, type Clock } from "../common/clock.js";
import { SocketHub } from "../common/socket-hub.js";
import { CONFIG, type Config } from "../config/config.js";
import type { Barangay, User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { hashSecret, verifySecret } from "./hashing.js";
import type { AuthUser } from "./subjects.js";
import { newOpaqueToken, sha256Hex, signAccessToken } from "./tokens.js";
import { toBarangayView, toUserView } from "./views.js";

export type SessionWithRefresh = SessionResult & { refreshToken: string; refreshExpiresAt: Date };

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

// Unknown usernames are checked against a real hash too, so the answer takes as long as a wrong secret.
let timingHash: Promise<string> | undefined;
const timingDummy = () => (timingHash ??= hashSecret("bqueue-timing-dummy"));

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly hub: SocketHub,
  ) {}

  /** Opens a session family. The refresh token lives until the barangay expires; only its hash is stored. */
  async startSession(userId: string): Promise<SessionWithRefresh> {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, include: { barangay: true } });
    const { token, hash } = newOpaqueToken();
    await this.db.session.create({
      data: {
        userId,
        familyId: randomUUID(),
        tokenHash: hash,
        expiresAt: user.barangay.expiresAt,
        createdAt: this.clock.now(),
      },
    });
    return { ...(await this.result(user, user.barangay)), refreshToken: token, refreshExpiresAt: user.barangay.expiresAt };
  }

  /**
   * Spec 7.1: a wrong secret, an unknown user and a deactivated user get the same answer. The 5th wrong secret
   * in a row locks the account for 15 minutes; while locked, even the right secret is refused.
   */
  async login(input: LoginInput): Promise<SessionWithRefresh> {
    const now = this.clock.now();
    const user = await this.db.user.findUnique({ where: { username: input.username }, include: { barangay: true } });
    if (!user || !user.active) {
      await verifySecret(await timingDummy(), input.secret);
      throw new AppError("invalid_credentials");
    }
    if (user.lockedUntil && user.lockedUntil > now) throw new AppError("account_locked", { retryAfter: user.lockedUntil });

    if (!(await verifySecret(user.secretHash, input.secret))) {
      const { failedAttempts } = await this.db.user.update({
        where: { id: user.id },
        data: { failedAttempts: { increment: 1 } },
        select: { failedAttempts: true },
      });
      if (failedAttempts < MAX_FAILED_ATTEMPTS) throw new AppError("invalid_credentials");
      const lockedUntil = new Date(now.getTime() + LOCK_MS);
      await this.db.user.update({ where: { id: user.id }, data: { lockedUntil, failedAttempts: 0 } });
      throw new AppError("account_locked", { retryAfter: lockedUntil });
    }

    // Checked after the secret, so only someone who knows it learns that the barangay has expired.
    if (user.barangay.expiresAt <= now) throw new AppError("session_expired");
    if (user.failedAttempts > 0 || user.lockedUntil) {
      await this.db.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
    }
    return this.startSession(user.id);
  }

  /** Rotation (spec 7.2): a replaced token that comes back may have been copied, so it ends the whole family. */
  async refresh(token: string | undefined): Promise<SessionWithRefresh> {
    if (!token) throw new AppError("unauthenticated");
    const now = this.clock.now();
    const session = await this.db.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: { include: { barangay: true } } },
    });
    if (!session || session.revokedAt) throw new AppError("unauthenticated");
    if (session.replacedById) {
      await this.revokeFamily(session.familyId);
      throw new AppError("unauthenticated");
    }
    const { user } = session;
    if (session.expiresAt <= now || user.barangay.expiresAt <= now) throw new AppError("session_expired");
    if (!user.active) throw new AppError("unauthenticated");

    const next = newOpaqueToken();
    const nextId = randomUUID();
    const rotated = await this.db.$transaction(async (tx) => {
      // Only one of two simultaneous refreshes with the same token can claim it.
      const { count } = await tx.session.updateMany({
        where: { id: session.id, replacedById: null, revokedAt: null },
        data: { replacedById: nextId },
      });
      if (count === 0) return false;
      await tx.session.create({
        data: {
          id: nextId,
          userId: user.id,
          familyId: session.familyId,
          tokenHash: next.hash,
          expiresAt: session.expiresAt,
          createdAt: now,
        },
      });
      return true;
    });
    if (!rotated) {
      await this.revokeFamily(session.familyId);
      throw new AppError("unauthenticated");
    }
    return { ...(await this.result(user, user.barangay)), refreshToken: next.token, refreshExpiresAt: session.expiresAt };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const session = await this.db.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      select: { familyId: true, userId: true },
    });
    if (!session) return;
    await this.revokeFamily(session.familyId);
    await this.disconnectUser(session.userId);
  }

  /** Every device of this user must sign in again (deactivation, spec 7.2). */
  async revokeUserSessions(userId: string): Promise<void> {
    await this.db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: this.clock.now() } });
    await this.disconnectUser(userId);
  }

  /** Spec 7.2: the user's open sockets hear `session:revoked` and are closed. */
  private disconnectUser(userId: string): Promise<void> {
    return this.hub.disconnect(`u:${userId}`, { event: "session:revoked", payload: {} });
  }

  async me(user: AuthUser): Promise<MeView> {
    const row = await this.db.user.findFirst({
      where: { id: user.userId, barangayId: user.barangayId },
      include: { barangay: true, resident: { select: { id: true } }, counters: { select: { id: true }, take: 1 } },
    });
    if (!row) throw new AppError("unauthenticated");
    return {
      user: toUserView(row),
      barangay: toBarangayView(row.barangay),
      residentId: row.resident?.id ?? null,
      counterId: row.counters[0]?.id ?? null,
    };
  }

  private async result(user: User, barangay: Barangay): Promise<SessionResult> {
    const accessToken = await signAccessToken(
      { kind: "user", userId: user.id, barangayId: barangay.id, role: user.role },
      this.config.JWT_SECRET,
      this.clock.now(),
    );
    return { accessToken, user: toUserView(user), barangay: toBarangayView(barangay) };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.db.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: this.clock.now() } });
  }
}
