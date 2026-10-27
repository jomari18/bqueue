import { type DynamicModule, Global, Module } from "@nestjs/common";
import { MePlaceholderController } from "./auth/me.placeholder.controller.js";
import { CLOCK, systemClock } from "./common/clock.js";
import { CONFIG, type Config } from "./config/config.js";
import { HealthController } from "./health/health.controller.js";

@Global()
@Module({})
export class AppModule {
  static forRoot(config: Config): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, MePlaceholderController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: CLOCK, useValue: systemClock },
      ],
      exports: [CONFIG, CLOCK],
    };
  }
}
