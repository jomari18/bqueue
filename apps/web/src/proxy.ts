import { type NextRequest, NextResponse } from "next/server";
import { apiConnectOrigins, buildCsp } from "@/lib/csp";

const connectOrigins = apiConnectOrigins({
  NEXT_PUBLIC_API_WAKE_URL: process.env.NEXT_PUBLIC_API_WAKE_URL,
  NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
});

/** A fresh nonce for every page; Next.js adds it to its own scripts from the request's CSP header. */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, { isDev: process.env.NODE_ENV === "development", connectOrigins });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|logo.svg|og.png|ticket-still.webp|fonts|sounds|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
