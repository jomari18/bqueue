// @vitest-environment node
import { readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const read = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");

type Redirect = { from: string; to: string; status: number; force?: boolean; signed?: string };
type Netlify = { build: { command: string; publish: string; environment: Record<string, string> }; redirects: Redirect[] };
type Render = { services: { name: string; region: string; plan: string; autoDeployTrigger: string; healthCheckPath: string; envVars: { key: string; sync: boolean }[] }[] };

const netlify = parseToml(read("netlify.toml")) as unknown as Netlify;
const render = parseYaml(read("render.yaml")) as Render;
const API = "https://bqueue-api.onrender.com";

describe("netlify.toml (spec 4 and 15)", () => {
  it("proxies /api to the Render API with Netlify's signature", () => {
    expect(netlify.redirects.find((r) => r.from === "/api/*")).toEqual({
      from: "/api/*",
      to: `${API}/api/:splat`,
      status: 200,
      force: true,
      signed: "PROXY_SIGNING_SECRET",
    });
  });

  it("has no single-page fallback: the Next.js runtime routes the pages", () => {
    expect(netlify.redirects.some((r) => r.from === "/*")).toBe(false);
  });

  it("points the browser's direct API addresses at the same Render service", () => {
    expect(netlify.build.environment.NEXT_PUBLIC_API_WAKE_URL).toBe(`${API}/api/health`);
    expect(netlify.build.environment.NEXT_PUBLIC_SOCKET_URL).toBe(API);
    expect(netlify.build.command).toBe("npm run build -w @bq/web");
  });
});

describe("render.yaml (spec 15)", () => {
  const api = render.services[0]!;

  it("deploys the API only after CI passes, with a health check", () => {
    expect(api).toMatchObject({ name: "bqueue-api", region: "singapore", plan: "free", autoDeployTrigger: "checksPass", healthCheckPath: "/api/health" });
  });

  it("lists exactly the eight secrets, none of them in the file", () => {
    expect(api.envVars.map((v) => v.key).sort()).toEqual(
      ["CLEANUP_SECRET", "DATABASE_URL", "DIRECT_URL", "IP_HASH_SALT", "JWT_SECRET", "PROXY_SIGNING_SECRET", "SITE_ORIGIN", "SOCKET_TICKET_SECRET"].sort(),
    );
    expect(api.envVars.every((v) => v.sync === false && Object.keys(v).length === 2)).toBe(true);
  });
});
