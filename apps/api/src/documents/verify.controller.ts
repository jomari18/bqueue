import { Controller, Get, Inject, Param } from "@nestjs/common";
import { normalizeVerificationCode, type VerifyResult } from "@bq/shared";
import { AppError } from "../common/app-error.js";
import { CLOCK, type Clock } from "../common/clock.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * The public "Verify document" check (spec 3.6). It shows only the document type, the name, the dates and the
 * barangay, never the purpose, address or birth date (spec 13). Rate-limited in configure-app.
 */
@Controller("verify")
export class VerifyController {
  constructor(
    private readonly db: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get(":code")
  async verify(@Param("code") typed: string): Promise<VerifyResult> {
    const code = normalizeVerificationCode(typed);
    if (!code) throw new AppError("not_found");
    const row = await this.db.request.findUnique({
      where: { verificationCode: code },
      include: {
        documentType: { select: { nameEn: true, nameFil: true } },
        resident: { select: { fullName: true } },
        barangay: { select: { name: true, city: true } },
      },
    });
    if (!row || !row.releasedAt || !row.validUntil) throw new AppError("not_found");
    const status = row.revokedAt ? "REVOKED" : row.validUntil < this.clock.now() ? "EXPIRED" : "VALID";
    return {
      status,
      documentName: { en: row.documentType.nameEn, fil: row.documentType.nameFil },
      fullName: row.resident.fullName,
      issuedAt: row.releasedAt.toISOString(),
      validUntil: row.validUntil.toISOString(),
      barangay: row.barangay,
    };
  }
}
