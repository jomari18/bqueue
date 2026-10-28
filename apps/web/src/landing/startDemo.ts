import type { DemoStartResult } from "@bq/shared";
import { api } from "@/lib/api/client";
import { wakeApi } from "@/lib/api/wake";
import { saveDemo } from "@/lib/auth/demo-store";
import { setSession } from "@/lib/auth/session";

let inFlight: Promise<void> | null = null;

/**
 * "Try the demo" (spec 7.5): wake the free API, open one demo barangay, keep its logins on this device and land
 * on the staff counter. A second click while the first is running joins it instead of opening another barangay.
 */
export function startDemo(opts: { navigate?: (path: string) => void; wakeIntervalMs?: number } = {}): Promise<void> {
  inFlight ??= (async () => {
    try {
      await wakeApi(undefined, { intervalMs: opts.wakeIntervalMs });
      const demo = await api<DemoStartResult>("/api/demo", { method: "POST", auth: false });
      setSession({ accessToken: demo.accessToken, user: demo.user, barangay: demo.barangay });
      saveDemo({
        barangay: { code: demo.barangay.code, name: demo.barangay.name, expiresAt: demo.expiresAt },
        logins: demo.demoLogins,
        displayLink: demo.displayLink,
        kioskLink: demo.kioskLink,
        joinLink: demo.joinLink,
        joinExpiresAt: demo.joinExpiresAt,
      });
      (opts.navigate ?? ((path) => location.assign(path)))("/staff/counter");
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
