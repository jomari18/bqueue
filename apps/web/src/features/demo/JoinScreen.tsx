"use client";

import type { SessionResult } from "@bq/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { wakeApi } from "@/lib/api/wake";
import { setSession } from "@/lib/auth/session";

/** The phone that scanned the demo panel's QR code signs in as Juan Dela Cruz; no password is typed (spec 7.5). */
export function JoinScreen({ wakeIntervalMs }: { wakeIntervalMs?: number }) {
  const t = useTranslations("join");
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const code = window.location.hash.slice(1);
    void (async () => {
      await wakeApi(undefined, { intervalMs: wakeIntervalMs });
      try {
        setSession(await api<SessionResult>("/api/demo/join", { method: "POST", json: { code }, auth: false }));
        router.replace("/r");
      } catch {
        setFailed(true);
      }
    })();
  }, [router, wakeIntervalMs]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center" aria-live="polite">
      <p className={failed ? "text-danger" : "text-muted"}>{failed ? t("expired") : t("joining")}</p>
    </main>
  );
}
