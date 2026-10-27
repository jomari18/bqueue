/** Trims the text and collapses runs of spaces. */
export function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}
