import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/app-error.js";
import { CLOCK, type Clock } from "../common/clock.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { KeySubject } from "./subjects.js";
import { sha256Hex } from "./tokens.js";

/** Display and kiosk keys (spec 7.3): random secrets in the link's fragment, stored only as hashes. */
@Injectable()
export class KeysService {
  constructor(
    private readonly db: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async subjectForKey(kind: "display" | "kiosk", key: string): Promise<KeySubject> {
    const hash = sha256Hex(key);
    const barangay = await this.db.barangay.findUnique({
      where: kind === "display" ? { displayKeyHash: hash } : { kioskKeyHash: hash },
      select: { id: true, expiresAt: true },
    });
    if (!barangay) throw new AppError("unauthenticated");
    if (barangay.expiresAt <= this.clock.now()) throw new AppError("session_expired");
    return { kind, barangayId: barangay.id };
  }
}
