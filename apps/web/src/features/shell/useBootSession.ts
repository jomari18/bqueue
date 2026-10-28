"use client";

import { useEffect, useState } from "react";
import { wakeApi } from "@/lib/api/wake";
import { getSession, refreshSession, type SessionStatus, setStatus, useSession } from "@/lib/auth/session";

/**
 * Opening a page in a new tab: wake the free API directly first (the proxy gives up after 26 seconds), then restore
 * the session from the refresh cookie. Offline answers retry every 10 seconds.
 */
export function useBootSession(opts: { wakeIntervalMs?: number } = {}): { status: SessionStatus; waking: boolean } {
  const { status } = useSession();
  const [waking, setWaking] = useState(() => !getSession());

  useEffect(() => {
    if (getSession()) return;
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const boot = async () => {
      setStatus("booting");
      setWaking(true);
      await wakeApi(undefined, { intervalMs: opts.wakeIntervalMs });
      if (!live) return;
      setWaking(false);
      const result = await refreshSession();
      if (live && result === "offline") retry = setTimeout(() => void boot(), 10_000);
    };
    void boot();
    return () => {
      live = false;
      if (retry) clearTimeout(retry);
    };
  }, [opts.wakeIntervalMs]);

  return { status, waking };
}
