import { Controller, Get, UseGuards } from "@nestjs/common";
import { DOCUMENT_CODES, type DocumentTypeView } from "@bq/shared";
import { CurrentUser } from "../auth/decorators.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { AuthUser } from "../auth/subjects.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toDocumentTypeView } from "./views.js";

@Controller("document-types")
@UseGuards(JwtAuthGuard)
export class DocumentTypesController {
  constructor(private readonly db: PrismaService) {}

  /** Active types in the spec's order, with names in both languages (spec 12). */
  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<DocumentTypeView[]> {
    const rows = await this.db.documentType.findMany({ where: { barangayId: user.barangayId, active: true } });
    return rows.sort((a, b) => DOCUMENT_CODES.indexOf(a.code) - DOCUMENT_CODES.indexOf(b.code)).map(toDocumentTypeView);
  }
}
