// "Today" is the Manila calendar day. Manila is a fixed UTC+8 with no daylight saving time.
export const MANILA_TZ = "Asia/Manila";
const OFFSET_MS = 8 * 60 * 60 * 1000;

/** The Manila date of an instant, as YYYY-MM-DD. */
export function manilaDate(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a Manila day starts. */
export function manilaDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+08:00`);
}

/** The Manila hour (0–23) of an instant. */
export function manilaHour(d: Date): number {
  return new Date(d.getTime() + OFFSET_MS).getUTCHours();
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
