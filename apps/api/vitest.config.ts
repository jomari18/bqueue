import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // esbuild drops decorator metadata, which Nest's constructor injection needs; SWC keeps it (.swcrc).
  plugins: [swc.vite({ module: { type: "es6" } })],
  resolve: {
    // Tests run against the shared source; the built API uses the compiled package.
    alias: { "@bq/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) },
  },
  test: {
    name: "api",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    // Database tests share one local database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
