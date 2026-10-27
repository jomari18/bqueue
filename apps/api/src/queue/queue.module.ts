import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { CountersController } from "./counters.controller.js";
import { CountersService } from "./counters.service.js";
import { KioskController } from "./kiosk.controller.js";
import { QueueController, QueueStateController } from "./queue.controller.js";
import { QueueService } from "./queue.service.js";

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [QueueStateController, QueueController, CountersController, KioskController],
  providers: [QueueService, CountersService],
  exports: [QueueService, CountersService],
})
export class QueueModule {}
