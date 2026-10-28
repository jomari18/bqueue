import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";
import tseslint from "typescript-eslint";

const WEB = ["apps/web/**/*.{ts,tsx,js,jsx,mjs}"];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/generated/**",
      "**/.next/**",
      "**/next-env.d.ts",
      ".superpowers/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // Next.js rules (React, hooks, accessibility, core web vitals) for the web app only.
  ...nextVitals.map((config) => ({ ...config, files: WEB })),
  { files: WEB, settings: { next: { rootDir: "apps/web" } } },
);
