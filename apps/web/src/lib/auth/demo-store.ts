import type { DemoLogins } from "@bq/shared";

// The demo logins and links are kept on this device for the role switcher and the TV button (spec 7.5).
// Every access is guarded: storage can be missing in private windows or blocked.

const KEY = "bq-demo";

export type DemoDevice = {
  barangay: { code: string; name: string; expiresAt: string };
  logins: DemoLogins;
  displayLink: string;
  kioskLink: string;
  joinLink: string;
  joinExpiresAt: string;
};

export function saveDemo(d: DemoDevice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // Without storage the role switcher is simply not shown.
  }
}

/** The stored demo, or null once its barangay has expired. */
export function loadDemo(now = new Date()): DemoDevice | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DemoDevice;
    return new Date(d.barangay.expiresAt) > now ? d : null;
  } catch {
    return null;
  }
}

export function updateDemoLinks(patch: Partial<Pick<DemoDevice, "displayLink" | "kioskLink" | "joinLink" | "joinExpiresAt">>): void {
  const d = loadDemo();
  if (d) saveDemo({ ...d, ...patch });
}

export function clearDemo(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
