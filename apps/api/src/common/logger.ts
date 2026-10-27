import { pino, type Logger } from "pino";
import type { Config } from "../config/config.js";

// Logs carry ids, codes and timings only; never request bodies, names or secrets (spec 13).
export function createLogger(config: Config): Logger {
  return pino({ level: config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL });
}
