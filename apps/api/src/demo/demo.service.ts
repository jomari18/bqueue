import { createHmac, randomInt } from "node:crypto";
import { type DemoStartResult, type JoinCodeResult, manilaDate, manilaDayStart, PinSchema } from "@bq/shared";
import { Inject, Injectable } from "@nestjs/common";
import { AuthService, type SessionWithRefresh } from "../auth/auth.service.js";
import { hashSecret } from "../auth/hashing.js";
import { newOpaqueToken, sha256Hex } from "../auth/tokens.js";
import { AppError } from "../common/app-error.js";
import { CLOCK, type Clock } from "../common/clock.js";
import { CONFIG, type Config } from "../config/config.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { closeStaleTickets } from "../queue/day-boundary.js";
import { generateDemoData } from "./generate-demo.js";
import { insertDemoData } from "./insert-demo.js";

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DAY_MS = 24 * 60 * 60 * 1000;
const JOIN_CODE_MS = 10 * 60_000;
const DEMOS_PER_IP_PER_DAY = 5;
const MAX_ACTIVE = 200;
const CLEANUP_ON_CREATE = 20;
const ATTEMPTS = 2;

const randomString = (alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet.charAt(randomInt(alphabet.length))).join("");

function randomPin(): string {
  for (;;) {
    const pin = String(randomInt(1_000_000)).padStart(6, "0");
    if (PinSchema.safeParse(pin).success) return pin;
  }
}

/** IPs are kept only as salted hashes, for the demo limit (spec 13). */
export function ipHash(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex");
}

const dayDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

@Injectable()
export class DemoService {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Spec 7.5: "Barangay Masagana" with a month of history, its kapitan, two staff and the resident Juan. Signs the
   * visitor in as Kuya Ramil (staff, Counter 2) and returns the demo logins and links once.
   */
  async create(ip: string): Promise<DemoStartResult & { refreshToken: string; refreshExpiresAt: Date }> {
    const now = this.clock.now();
    const today = manilaDate(now);
    const hashedIp = ipHash(ip, this.config.IP_HASH_SALT);
    const quota = await this.db.demoQuota.findUnique({ where: { ipHash_day: { ipHash: hashedIp, day: dayDate(today) } } });
    if (quota && quota.count >= DEMOS_PER_IP_PER_DAY) throw this.demoLimit(now);

    await this.deleteExpired(CLEANUP_ON_CREATE);
    if ((await this.db.barangay.count({ where: { expiresAt: { gt: now } } })) >= MAX_ACTIVE) throw new AppError("demo_full");

    const passwords = { kapitan: randomString(PASSWORD_ALPHABET, 16), resident: randomString(PASSWORD_ALPHABET, 16) };
    const pins = { staff1: randomPin(), staff2: randomPin() };
    const [kapitanHash, residentHash, staff1Hash, staff2Hash] = await Promise.all([
      hashSecret(passwords.kapitan),
      hashSecret(passwords.resident),
      hashSecret(pins.staff1),
      hashSecret(pins.staff2),
    ]);
    const keys = { display: newOpaqueToken(), kiosk: newOpaqueToken(), join: newOpaqueToken(16) };
    const expiresAt = new Date(now.getTime() + DAY_MS);
    const joinExpiresAt = new Date(now.getTime() + JOIN_CODE_MS);

    let created: { code: string; staff2Id: string } | undefined;
    for (let attempt = 1; !created; attempt++) {
      const code = randomString(CODE_ALPHABET, 4);
      try {
        created = await this.db.$transaction(
          async (tx) => {
            const barangay = await tx.barangay.create({
              data: {
                code,
                name: "Barangay Masagana",
                city: "Lungsod ng Kalayaan",
                displayKeyHash: keys.display.hash,
                kioskKeyHash: keys.kiosk.hash,
                joinCodeHash: keys.join.hash,
                joinCodeExpiresAt: joinExpiresAt,
                lastHumanActionAt: now,
                createdAt: now,
                expiresAt,
              },
            });
            const user = (role: "KAPITAN" | "STAFF" | "RESIDENT", name: string, displayName: string, secretHash: string, pin = false) =>
              tx.user.create({
                data: {
                  barangayId: barangay.id,
                  role,
                  username: `${name}.${code}`,
                  displayName,
                  secretHash,
                  secretKind: pin ? "PIN" : "PASSWORD",
                  createdAt: now,
                },
              });
            const kapitan = await user("KAPITAN", "kapitan", "Hon. Teresa Villanueva", kapitanHash);
            const staff1 = await user("STAFF", "staff1", "Ate Liza", staff1Hash, true);
            const staff2 = await user("STAFF", "staff2", "Kuya Ramil", staff2Hash, true);
            const resident = await user("RESIDENT", "juan", "Juan Dela Cruz", residentHash);
            const data = generateDemoData({ seed: randomInt(2 ** 31), code, now });
            await insertDemoData(tx, barangay.id, { kapitan: kapitan.id, staff1: staff1.id, staff2: staff2.id, resident: resident.id }, data);
            // Counted inside the transaction, so two requests at once cannot both slip past the limit.
            const counted = await tx.demoQuota.upsert({
              where: { ipHash_day: { ipHash: hashedIp, day: dayDate(today) } },
              create: { ipHash: hashedIp, day: dayDate(today), count: 1 },
              update: { count: { increment: 1 } },
            });
            if (counted.count > DEMOS_PER_IP_PER_DAY) throw this.demoLimit(now);
            return { code, staff2Id: staff2.id };
          },
          { maxWait: 5_000, timeout: 20_000 },
        );
      } catch (err) {
        // Another barangay took the code, or a verification code collided: try once more with fresh values.
        const taken = err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2002" || err.code === "P2010");
        if (!taken || attempt >= ATTEMPTS) throw err;
      }
    }

    const session = await this.auth.startSession(created.staff2Id);
    const site = this.config.SITE_ORIGIN;
    return {
      ...session,
      demoLogins: {
        kapitan: { username: `kapitan.${created.code}`, password: passwords.kapitan },
        staff: { username: `staff2.${created.code}`, pin: pins.staff2 },
        resident: { username: `juan.${created.code}`, password: passwords.resident },
      },
      displayLink: `${site}/display#${keys.display.token}`,
      kioskLink: `${site}/kiosk#${keys.kiosk.token}`,
      joinLink: `${site}/join#${keys.join.token}`,
      joinExpiresAt: joinExpiresAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** A phone that scanned the demo panel's QR signs in as the demo resident; each code works once (spec 7.5). */
  async join(code: string): Promise<SessionWithRefresh> {
    const now = this.clock.now();
    const hash = sha256Hex(code);
    const barangay = await this.db.barangay.findUnique({ where: { joinCodeHash: hash } });
    if (!barangay || !barangay.joinCodeExpiresAt || barangay.joinCodeExpiresAt <= now || barangay.expiresAt <= now) {
      throw new AppError("invalid_credentials");
    }
    const { count } = await this.db.barangay.updateMany({
      where: { id: barangay.id, joinCodeHash: hash },
      data: { joinCodeHash: null, joinCodeExpiresAt: null },
    });
    if (count !== 1) throw new AppError("invalid_credentials");
    const resident = await this.db.user.findFirst({
      where: { barangayId: barangay.id, role: "RESIDENT", username: `juan.${barangay.code}`, active: true },
    });
    if (!resident) throw new AppError("invalid_credentials");
    return this.auth.startSession(resident.id);
  }

  /** A fresh QR code for the demo panel; the previous code stops working. */
  async newJoinCode(barangayId: string): Promise<JoinCodeResult> {
    const join = newOpaqueToken(16);
    const joinExpiresAt = new Date(this.clock.now().getTime() + JOIN_CODE_MS);
    await this.db.barangay.update({ where: { id: barangayId }, data: { joinCodeHash: join.hash, joinCodeExpiresAt: joinExpiresAt } });
    return { joinLink: `${this.config.SITE_ORIGIN}/join#${join.token}`, joinExpiresAt: joinExpiresAt.toISOString() };
  }

  /**
   * The daily job (and every new demo) deletes expired barangays; everything they own cascades. The job also closes
   * yesterday's leftover tickets in every barangay (spec 6.10).
   */
  async cleanup(limit = 20): Promise<{ deleted: number }> {
    const now = this.clock.now();
    const deleted = await this.deleteExpired(limit);
    await this.db.$transaction((tx) => closeStaleTickets(tx, null, manilaDate(now)));
    await this.db.demoQuota.deleteMany({ where: { day: { lt: dayDate(manilaDate(new Date(now.getTime() - 2 * DAY_MS))) } } });
    return { deleted };
  }

  private async deleteExpired(limit: number): Promise<number> {
    const expired = await this.db.barangay.findMany({
      where: { expiresAt: { lte: this.clock.now() } },
      select: { id: true },
      take: limit,
    });
    if (expired.length === 0) return 0;
    const { count } = await this.db.barangay.deleteMany({ where: { id: { in: expired.map((b) => b.id) } } });
    return count;
  }

  private demoLimit(now: Date): AppError {
    const tomorrow = new Date(manilaDayStart(manilaDate(now)).getTime() + DAY_MS);
    return new AppError("demo_limit", { retryAfter: tomorrow });
  }
}
