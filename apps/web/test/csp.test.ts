import { describe, expect, it } from "vitest";
import { apiConnectOrigins, buildCsp } from "../src/lib/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("Content Security Policy (spec 13)", () => {
  const prod = apiConnectOrigins({
    NEXT_PUBLIC_API_WAKE_URL: "https://bqueue-api.onrender.com/api/health",
    NEXT_PUBLIC_SOCKET_URL: "https://bqueue-api.onrender.com",
  });

  it("allows the API over https and wss in production", () => {
    expect(prod).toEqual(["https://bqueue-api.onrender.com", "wss://bqueue-api.onrender.com"]);
    const csp = buildCsp("abc123", { isDev: false, connectOrigins: prod });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://bqueue-api.onrender.com wss://bqueue-api.onrender.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows the local API over http and ws", () => {
    expect(apiConnectOrigins({ NEXT_PUBLIC_API_WAKE_URL: "http://127.0.0.1:8080/api/health", NEXT_PUBLIC_SOCKET_URL: "http://127.0.0.1:8080" })).toEqual([
      "http://127.0.0.1:8080",
      "ws://127.0.0.1:8080",
    ]);
  });

  it("adds unsafe-eval only in development", () => {
    expect(buildCsp("n", { isDev: true, connectOrigins: [] })).toContain("'unsafe-eval'");
  });
});
