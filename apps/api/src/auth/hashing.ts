import { hash, verify } from "@node-rs/argon2";

/** Passwords and PINs are stored only as argon2id hashes (spec 7.1). */
export function hashSecret(secret: string): Promise<string> {
  return hash(secret);
}

export async function verifySecret(hashed: string, secret: string): Promise<boolean> {
  try {
    return await verify(hashed, secret);
  } catch {
    return false;
  }
}
