/** Test-only values; never used outside local tests. */
export const testEnv = {
  NODE_ENV: "test",
  PORT: "8080",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://bq:bq@127.0.0.1:55434/bq_test",
  JWT_SECRET: "test-jwt-secret-0123456789abcdefghij",
  SOCKET_TICKET_SECRET: "test-socket-secret-0123456789abcdefg",
  PROXY_SIGNING_SECRET: "test-proxy-secret-0123456789abcdefgh",
  CLEANUP_SECRET: "test-cleanup-secret-0123456789abcdef",
  IP_HASH_SALT: "test-ip-salt-0123456789abcdefghijklm",
  SITE_ORIGIN: "https://bqueue.test",
  PUBLIC_URL: "https://bqueue-api.test",
  SIMULATOR_ENABLED: "false",
  LOG_LEVEL: "info",
} as const;
