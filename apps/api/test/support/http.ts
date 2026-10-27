import { randomInt } from "node:crypto";
import request, { type Response } from "supertest";
import type { TestApp } from "./app.js";
import { testEnv } from "./env.js";
import { signNetlify } from "./signing.js";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

/** A request as it arrives through Netlify's signed proxy, from a fresh visitor IP unless one is given. */
export async function call(
  t: TestApp,
  method: Method,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string>; ip?: string } = {},
): Promise<Response> {
  let req = request(t.http)[method.toLowerCase() as "get"](path)
    .set("x-nf-sign", await signNetlify(testEnv.PROXY_SIGNING_SECRET))
    .set("x-nf-client-connection-ip", opts.ip ?? randomIp());
  if (opts.token) req = req.set("authorization", `Bearer ${opts.token}`);
  for (const [k, v] of Object.entries(opts.headers ?? {})) req = req.set(k, v);
  return opts.body === undefined ? req : req.send(opts.body as object);
}
