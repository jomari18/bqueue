"use client";

import { useEffect, useState } from "react";

/**
 * True once nothing has changed for `ms` (Review Focus 3): a TV left on overnight stops holding a connection.
 * A new `lastChangeAt` (a queue change, or the tap that resumes) clears it.
 */
export function useIdlePause(lastChangeAt: number, ms = 30 * 60_000): boolean {
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setPausedAt(lastChangeAt), Math.max(0, lastChangeAt + ms - Date.now()));
    return () => clearTimeout(timer);
  }, [lastChangeAt, ms]);
  return pausedAt === lastChangeAt;
}
