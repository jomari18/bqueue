import { Module } from "@nestjs/common";
import { AuthController, MeController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { KeyGuard, QueueReaderGuard } from "./key.guard.js";
import { KeysService } from "./keys.service.js";
import { RolesGuard } from "./roles.guard.js";

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, KeysService, KeyGuard, QueueReaderGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard, KeysService, KeyGuard, QueueReaderGuard],
})
export class AuthModule {}
