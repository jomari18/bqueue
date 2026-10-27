import "reflect-metadata";
import type { Server } from "node:http";
import type { Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { pino } from "pino";
import { AppModule } from "../../src/app.module.js";
import { CLOCK, type Clock } from "../../src/common/clock.js";
import { configureApp } from "../../src/configure-app.js";
import { loadConfig } from "../../src/config/config.js";
import { testEnv } from "./env.js";

/** A clock tests can set and move. */
export class TestClock implements Clock {
  private current: Date;
  constructor(iso: string) {
    this.current = new Date(iso);
  }
  now(): Date {
    return new Date(this.current);
  }
  set(iso: string): void {
    this.current = new Date(iso);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export type TestApp = {
  app: NestExpressApplication;
  http: Server;
  clock: TestClock;
  close(): Promise<void>;
};

export async function createTestApp(
  opts: {
    clock?: TestClock;
    controllers?: Type[];
    configure?: (b: TestingModuleBuilder) => TestingModuleBuilder;
    logLines?: object[];
    env?: Partial<Record<keyof typeof testEnv, string>>;
  } = {},
): Promise<TestApp> {
  const config = loadConfig({ ...testEnv, ...opts.env });
  const clock = opts.clock ?? new TestClock("2026-10-28T02:00:00Z");
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(config)],
    controllers: opts.controllers ?? [],
  })
    .overrideProvider(CLOCK)
    .useValue(clock);
  if (opts.configure) builder = opts.configure(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
  const lines = opts.logLines;
  const logger = lines
    ? pino({ level: "info" }, { write: (line: string) => void lines.push(JSON.parse(line)) })
    : pino({ level: "silent" });
  configureApp(app, config, logger);
  await app.init();
  return { app, http: app.getHttpServer() as Server, clock, close: () => app.close() };
}
