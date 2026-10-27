import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { createLogger } from "./common/logger.js";
import { configureApp } from "./configure-app.js";
import { loadConfig } from "./config/config.js";

const config = loadConfig(process.env);
const logger = createLogger(config);
const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
  bodyParser: false,
  logger: ["error", "warn"],
});
configureApp(app, config, logger);
app.enableShutdownHooks();
await app.listen(config.PORT, "0.0.0.0");
logger.info({ port: config.PORT }, "B.Queue API listening");
