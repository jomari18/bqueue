// Local stand-in for Netlify's signed proxy (spec 4). The API refuses unsigned requests, so in local development
// and in E2E Next.js rewrites /api to this proxy, which signs each request like Netlify does and forwards it.
//
//   node tools/dev-proxy.mjs          (listens on 8788, forwards to http://127.0.0.1:8080)
//
// Only for this machine: the default secret is the docker-compose.yml value, never a real one.
import http from "node:http";
import { SignJWT } from "jose";

const port = Number(process.env.BQ_PROXY_PORT ?? 8788);
const target = new URL(process.env.BQ_API_ORIGIN ?? "http://127.0.0.1:8080");
const secret = new TextEncoder().encode(process.env.PROXY_SIGNING_SECRET ?? "local-only-proxy-signing-secret-01234567");
// E2E gives every test its own visitor IP, so per-IP demo limits do not trip across tests.
const allowTestIp = process.env.BQ_ALLOW_TEST_IP === "1";

async function signature() {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ deploy_context: "dev", site_url: "http://localhost" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("netlify")
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(secret);
}

http
  .createServer(async (req, res) => {
    const headers = { ...req.headers };
    delete headers.host;
    const testIp = allowTestIp ? headers["x-bq-test-ip"] : undefined;
    delete headers["x-bq-test-ip"];
    headers["x-nf-sign"] = await signature();
    headers["x-nf-client-connection-ip"] = typeof testIp === "string" && testIp ? testIp : (req.socket.remoteAddress ?? "127.0.0.1");
    const upstream = http.request(
      { hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "service_unavailable", message: "The local API is not running." } }));
    });
    req.pipe(upstream);
  })
  .listen(port, "127.0.0.1", () => console.log(`dev proxy on http://127.0.0.1:${port} → ${target.origin}`));
