/** Used when no ticket in the lane has been served today (spec 6.9). */
export const DEFAULT_SERVICE_SECONDS = 240;

/** ceil(ahead × average service seconds ÷ 60 ÷ open counters serving the lane), with at least one counter. */
export function etaMinutes(ahead: number, avgServiceSeconds: number, openCounters: number): number {
  return Math.ceil((ahead * avgServiceSeconds) / 60 / Math.max(1, openCounters));
}
