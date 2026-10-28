import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EventsService } from "./events.service.js";
import { RealtimeController } from "./realtime.controller.js";
import { RealtimeGateway } from "./realtime.gateway.js";
import { UsedJtiStore } from "./socket-tickets.js";

@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [EventsService, UsedJtiStore, RealtimeGateway],
  exports: [EventsService, UsedJtiStore],
})
export class RealtimeModule {}
