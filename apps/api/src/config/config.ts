import { z } from "zod";

const secret = z.string().min(32, "Secrets need at least 32 characters.");

const ConfigSchema = z.object({
  NODE_ENV: z.string().default("production"),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: secret,
  SOCKET_TICKET_SECRET: secret,
  PROXY_SIGNING_SECRET: secret,
  CLEANUP_SECRET: secret,
  IP_HASH_SALT: secret,
  SITE_ORIGIN: z.url().transform((u) => new URL(u).origin),
  PUBLIC_URL: z.url().optional(),
  RENDER_EXTERNAL_URL: z.url().optional(),
  SIMULATOR_ENABLED: z.enum(["true", "false"]).default("true"),
  LOG_LEVEL: z.string().default("info"),
});

export type Config = Omit<z.infer<typeof ConfigSchema>, "PUBLIC_URL" | "RENDER_EXTERNAL_URL" | "SIMULATOR_ENABLED"> & {
  /** Where browsers reach this API directly (Socket.io and the wake-up ping). */
  PUBLIC_URL: string;
  SIMULATOR_ENABLED: boolean;
};

export const CONFIG = Symbol("CONFIG");

/** Reads and checks the environment once at start; a missing or weak value stops the API. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = ConfigSchema.parse(env);
  const { RENDER_EXTERNAL_URL, ...rest } = parsed;
  return {
    ...rest,
    PUBLIC_URL: (parsed.PUBLIC_URL ?? RENDER_EXTERNAL_URL ?? `http://localhost:${parsed.PORT}`).replace(/\/$/, ""),
    SIMULATOR_ENABLED: parsed.SIMULATOR_ENABLED === "true",
  };
}
