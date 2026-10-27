/**
 * Nonce-based Content Security Policy (spec 13), built per request in src/proxy.ts as in ResuMatch.
 * Styles allow 'unsafe-inline' because React and the 3D canvas set inline style attributes, which nonces cannot cover.
 * worker-src allows blob: for the font worker of drei's Text. connect-src adds the API's own origin for the wake-up
 * ping and its ws(s) twin for Socket.io, which Netlify cannot proxy.
 */
export function buildCsp(nonce: string, opts: { isDev: boolean; connectOrigins: string[] }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    ["connect-src 'self'", ...opts.connectOrigins].join(" "),
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** Each configured API URL's origin and its WebSocket twin, without duplicates. */
export function apiConnectOrigins(env: { NEXT_PUBLIC_API_WAKE_URL?: string; NEXT_PUBLIC_SOCKET_URL?: string }): string[] {
  const out = new Set<string>();
  for (const value of [env.NEXT_PUBLIC_API_WAKE_URL, env.NEXT_PUBLIC_SOCKET_URL]) {
    if (!value) continue;
    const { origin, protocol, host } = new URL(value);
    out.add(origin);
    out.add(`${protocol === "https:" ? "wss" : "ws"}://${host}`);
  }
  return [...out];
}
