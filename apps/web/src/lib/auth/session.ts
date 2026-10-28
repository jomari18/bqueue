"use client";

import type { SessionResult } from "@bq/shared";
import { useSyncExternalStore } from "react";
import { currentLocale } from "@/i18n/locale";
import { storedDemoExpired } from "./demo-store";

// The access token lives in memory only (spec 7.2); the refresh token is an HttpOnly cookie the page never sees.

export type SessionStatus = "booting" | "signed-in" | "signed-out" | "ended" | "offline";
type State = { session: SessionResult | null; status: SessionStatus };

let state: State = { session: null, status: "booting" };
const listeners = new Set<() => void>();
const emit = (next: State) => {
  state = next;
  for (const l of listeners) l();
};

export const getSession = () => state.session;
export const getStatus = () => state.status;

export function setSession(session: SessionResult): void {
  emit({ session, status: "signed-in" });
}

export function clearSession(status: Exclude<SessionStatus, "signed-in"> = "signed-out"): void {
  emit({ session: null, status });
}

export function setStatus(status: SessionStatus): void {
  emit({ ...state, status });
}

export function useSession(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

let refreshing: Promise<"ok" | "signed-out" | "ended" | "offline"> | null = null;

/**
 * Uses the refresh cookie. Only a 401 ends the session; a server or network error keeps it and reports
 * "offline", so a passing database error never signs anyone out (ZariZari's deferred minor M1).
 */
export function refreshSession(): Promise<"ok" | "signed-out" | "ended" | "offline"> {
  refreshing ??= (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "x-requested-with": "bqueue", "accept-language": currentLocale() },
        credentials: "same-origin",
      });
      if (res.ok) {
        setSession((await res.json()) as SessionResult);
        return "ok" as const;
      }
      if (res.status === 401) {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        // Once cleanup has deleted an expired barangay its sessions are gone too, and the API can only say
        // unauthenticated; the device still knows when its demo ended.
        const ended = body?.error?.code === "session_expired" || storedDemoExpired();
        clearSession(ended ? "ended" : "signed-out");
        return ended ? ("ended" as const) : ("signed-out" as const);
      }
      setStatus(state.session ? "signed-in" : "offline");
      return "offline" as const;
    } catch {
      setStatus(state.session ? "signed-in" : "offline");
      return "offline" as const;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function loginWith(username: string, secret: string): Promise<SessionResult> {
  const { api } = await import("@/lib/api/client");
  const result = await api<SessionResult>("/api/auth/login", { method: "POST", json: { username, secret }, auth: false });
  setSession(result);
  return result;
}

export async function logout(): Promise<void> {
  const { api } = await import("@/lib/api/client");
  await api("/api/auth/logout", { method: "POST", auth: false }).catch(() => undefined);
  clearSession("signed-out");
}
