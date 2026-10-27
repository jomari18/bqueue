"use client";

import type { TicketView } from "@bq/shared";
import { useEffect, useRef, useState } from "react";
import { alertsFor, createFiredStore } from "@/lib/realtime/alerts";

function play(src: string) {
  try {
    void new Audio(src).play().catch(() => undefined);
  } catch {
    // Audio may be blocked until the first tap; the banner still shows.
  }
}

/**
 * Spec 10: a banner, a sound and a vibration at 3 or fewer ahead; a full-screen notice when called; the tab title
 * changes while called. Each fires once per ticket state, even across a reload.
 */
export function useTicketAlerts(tickets: TicketView[]): { near: TicketView | null; called: TicketView | null; dismiss: () => void } {
  const fired = useRef<ReturnType<typeof createFiredStore> | null>(null);
  const [near, setNear] = useState<TicketView | null>(null);
  const [called, setCalled] = useState<TicketView | null>(null);

  useEffect(() => {
    fired.current ??= createFiredStore();
    for (const t of tickets) {
      for (const alert of alertsFor({ ...t, version: 0, ticketId: t.id }, fired.current)) {
        fired.current.add(alert.key);
        if (alert.kind === "near") {
          setNear(t);
          play("/sounds/alert.wav");
          navigator.vibrate?.(200);
        } else {
          setCalled(t);
          play("/sounds/alert.wav");
          navigator.vibrate?.([200, 100, 200]);
        }
      }
    }
    const current = tickets.find((t) => t.status === "CALLED");
    document.title = current ? `(!) ${current.code} · B.Queue` : "B.Queue";
  }, [tickets]);

  return { near, called, dismiss: () => setCalled(null) };
}
