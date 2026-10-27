import { randomInt } from "node:crypto";
import { CROCKFORD } from "@bq/shared";

/** 10 Crockford base32 characters from a cryptographic source, about 50 bits (spec 6.2). */
export function randomVerificationCode(): string {
  return Array.from({ length: 10 }, () => CROCKFORD[randomInt(32)]).join("");
}

export const CODE_GENERATOR = Symbol("CODE_GENERATOR");
export type CodeGenerator = { next(): string };
export const randomCodes: CodeGenerator = { next: randomVerificationCode };
