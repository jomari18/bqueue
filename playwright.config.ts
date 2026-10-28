import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the production web build and the API's Docker image (spec 16). The API runs in the
 * container `bq-api`, started before Playwright:
 *
 *   BQ_SITE_ORIGIN=http://localhost:3100 BQ_SIMULATOR=false docker compose up -d --build db api
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tools/dev-proxy.mjs",
      url: "http://127.0.0.1:8788/api/health",
      env: { BQ_ALLOW_TEST_IP: "1" },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npm run build -w @bq/web && npm run start -w @bq/web -- -p 3100",
      url: "http://localhost:3100/credits",
      env: {
        BQ_DEV_PROXY: "http://127.0.0.1:8788",
        NEXT_PUBLIC_API_WAKE_URL: "http://127.0.0.1:8080/api/health",
        NEXT_PUBLIC_SOCKET_URL: "http://127.0.0.1:8080",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
