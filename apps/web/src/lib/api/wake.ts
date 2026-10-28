/** The free Render instance sleeps; the page pings it directly (not through the 26-second proxy) until it answers. */
export const WAKE_URL = process.env.NEXT_PUBLIC_API_WAKE_URL ?? "/api/health";

export async function wakeApi(url = WAKE_URL, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<boolean> {
  const { timeoutMs = 90_000, intervalMs = 3_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return true;
    } catch {
      // Still asleep or offline: try again below.
    }
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
