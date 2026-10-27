import { type DynamicModule, Global, Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { CLOCK, systemClock } from "./common/clock.js";
import { CONFIG, type Config } from "./config/config.js";
import { DemoModule } from "./demo/demo.module.js";
import { DocumentsModule } from "./documents/documents.module.js";
import { SocketHub } from "./common/socket-hub.js";
import { HealthController } from "./health/health.controller.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Global()
@Module({})
export class AppModule {
  static forRoot(config: Config): DynamicModule {
    return {
      module: AppModule,
      imports: [PrismaModule, AuthModule, DemoModule, DocumentsModule],
      controllers: [HealthController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: CLOCK, useValue: systemClock },
        SocketHub,
      ],
      exports: [CONFIG, CLOCK, SocketHub],
    };
  }
}
