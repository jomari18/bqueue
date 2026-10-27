// Released documents carry a 10-character Crockford base32 code (spec 6.2).
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Uppercases, drops spaces and hyphens, and maps O→0 and I/L→1; null unless 10 valid characters remain. */
export function normalizeVerificationCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (code.length !== 10 || ![...code].every((c) => CROCKFORD.includes(c))) return null;
  return code;
}

/** "ABCDEFGHJK" → "ABCDE-FGHJK" */
export function formatVerificationCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}
