import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Local dev and E2E only: /api goes to tools/dev-proxy.mjs, which signs requests like Netlify's proxy does.
// On Netlify this is unset and netlify.toml proxies /api instead.
const devProxy = process.env.BQ_DEV_PROXY;

// cacheComponents/partial prerendering stay off: the nonce-based CSP in src/proxy.ts needs every page
// to render per request (Next.js CSP guide: PPR is incompatible with nonces).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), autoplay=(self)" },
        ],
      },
    ];
  },
  async rewrites() {
    return devProxy ? [{ source: "/api/:path*", destination: `${devProxy}/api/:path*` }] : [];
  },
};

export default withNextIntl(nextConfig);
