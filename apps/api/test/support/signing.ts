import { SignJWT } from "jose";

/** A valid `x-nf-sign` header, as Netlify's signed proxy sends it (HS256 JWS, issuer "netlify"). */
export async function signNetlify(secret: string, now = new Date()): Promise<string> {
  return new SignJWT({ deploy_context: "production", site_url: "https://bqueue.test", netlify_id: "test-site" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("netlify")
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + 60)
    .sign(new TextEncoder().encode(secret));
}
