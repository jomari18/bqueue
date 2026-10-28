import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DocumentsModule } from "../documents/documents.module.js";
import { QueueModule } from "../queue/queue.module.js";
import { HumanActionInterceptor } from "./human-action.js";
import { SimulatorService } from "./simulator.service.js";

@Module({
  imports: [QueueModule, DocumentsModule],
  providers: [SimulatorService, { provide: APP_INTERCEPTOR, useClass: HumanActionInterceptor }],
  exports: [SimulatorService],
})
export class SimulatorModule {}
