import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AdminController, DemoController } from "./demo.controller.js";
import { DemoService } from "./demo.service.js";

@Module({
  imports: [AuthModule],
  controllers: [DemoController, AdminController],
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
