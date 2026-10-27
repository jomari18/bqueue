import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { QueueController } from "./queue.controller.js";
import { QueueService } from "./queue.service.js";

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
