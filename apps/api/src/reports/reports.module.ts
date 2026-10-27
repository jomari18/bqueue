import { Controller, Get, Module, Query, UseGuards } from "@nestjs/common";
import { ReportsQuery, type ReportSummary } from "@bq/shared";
import { AuthModule } from "../auth/auth.module.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { RolesGuard } from "../auth/roles.guard.js";
import type { AuthUser } from "../auth/subjects.js";
import { ZodPipe } from "../common/pipes.js";
import { ReportsService } from "./reports.service.js";

@Controller("reports")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("KAPITAN")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthUser, @Query(new ZodPipe(ReportsQuery)) query: ReportsQuery): Promise<ReportSummary> {
    return this.reports.summary(user.barangayId, query.range);
  }
}

@Module({ imports: [AuthModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
