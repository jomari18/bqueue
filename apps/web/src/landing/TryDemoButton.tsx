"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { startDemo } from "./startDemo";

/** The landing's one action. The lime ring is the only place the CTA uses --lime (spec 11.2). */
export function TryDemoButton({ wakeIntervalMs }: { wakeIntervalMs?: number }) {
  const t = useTranslations("landing");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; signIn: boolean } | null>(null);

  async function open() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await startDemo({ navigate: (path) => router.push(path), wakeIntervalMs });
    } catch (err) {
      const api = err instanceof ApiError ? err : null;
      setError({ message: api && api.status !== 0 ? api.message : t("demoFailed"), signIn: api?.code === "demo_limit" });
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        onClick={() => void open()}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex min-h-14 items-center justify-center rounded-pill bg-accent px-8 text-lg font-semibold text-on-accent ring-4 ring-lime ring-offset-2 ring-offset-bg transition hover:brightness-110 disabled:cursor-wait disabled:opacity-80"
      >
        {t("tryDemo")}
      </button>
      <div aria-live="polite" className="text-sm">
        {busy && <p className="text-muted">{t("opening")}</p>}
        {error && (
          <p className="text-danger">
            {error.message}{" "}
            {error.signIn && (
              <Link href="/login" className="font-semibold text-accent-ink underline">
                {t("signIn")}
              </Link>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
