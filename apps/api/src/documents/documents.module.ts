import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { DocumentTypesController } from "./document-types.controller.js";
import { RequestsController } from "./requests.controller.js";
import { RequestsService } from "./requests.service.js";

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [DocumentTypesController, RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class DocumentsModule {}
