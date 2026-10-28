import { HumanAction } from "../simulator/human-action.js";
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  CounterInput,
  CounterPatch,
  DocumentTypePatch,
  SimulatorInput,
  StaffInput,
  StaffPatch,
} from "@bq/shared";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { RolesGuard } from "../auth/roles.guard.js";
import type { AuthUser } from "../auth/subjects.js";
import { AppError } from "../common/app-error.js";
import { UuidPipe, ZodPipe } from "../common/pipes.js";
import { SettingsService } from "./settings.service.js";

@HumanAction()
@Controller("settings")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("KAPITAN")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get("document-types")
  documentTypes(@CurrentUser() user: AuthUser) {
    return this.settings.documentTypes(user.barangayId);
  }

  @Patch("document-types/:id")
  patchDocumentType(
    @CurrentUser() user: AuthUser,
    @Param("id", UuidPipe) id: string,
    @Body(new ZodPipe(DocumentTypePatch)) patch: DocumentTypePatch,
  ) {
    return this.settings.patchDocumentType(user.barangayId, id, patch);
  }

  @Get("counters")
  counters(@CurrentUser() user: AuthUser) {
    return this.settings.counters(user.barangayId);
  }

  @Post("counters")
  addCounter(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CounterInput)) input: CounterInput) {
    return this.settings.addCounter(user.barangayId, input);
  }

  @Patch("counters/:id")
  patchCounter(@CurrentUser() user: AuthUser, @Param("id", UuidPipe) id: string, @Body(new ZodPipe(CounterPatch)) patch: CounterPatch) {
    return this.settings.patchCounter(user.barangayId, id, patch);
  }

  @Get("staff")
  staff(@CurrentUser() user: AuthUser) {
    return this.settings.staff(user.barangayId);
  }

  @Post("staff")
  addStaff(@CurrentUser() user: AuthUser, @Body(new ZodPipe(StaffInput)) input: StaffInput) {
    return this.settings.addStaff(user.barangayId, input);
  }

  @Patch("staff/:id")
  patchStaff(@CurrentUser() user: AuthUser, @Param("id", UuidPipe) id: string, @Body(new ZodPipe(StaffPatch)) patch: StaffPatch) {
    return this.settings.patchStaff(user.barangayId, id, patch);
  }

  @Post("keys/:kind/rotate")
  rotateKey(@CurrentUser() user: AuthUser, @Param("kind") kind: string) {
    if (kind !== "display" && kind !== "kiosk") throw new AppError("not_found");
    return this.settings.rotateKey(user.barangayId, kind);
  }

  @Patch("simulator")
  simulator(@CurrentUser() user: AuthUser, @Body(new ZodPipe(SimulatorInput)) input: SimulatorInput) {
    return this.settings.setSimulator(user.barangayId, input.on);
  }
}
