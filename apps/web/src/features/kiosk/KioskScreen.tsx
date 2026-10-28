"use client";

import { type KioskTicketResult, type Lane, LANES } from "@bq/shared";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { BrandMark, Button, LiveRegion } from "@/components/ui";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { LanguageToggle } from "@/components/LanguageToggle";
import { DemoEnded } from "@/features/demo/DemoEnded";
import { LinkInvalid } from "@/features/demo/LinkInvalid";
import { api, ApiError } from "@/lib/api/client";
import { useKeyQueue } from "@/lib/realtime/hooks";
import { KioskTicket } from "./KioskTicket";

type Attempt = { lane: Lane; id: string };
type Phase =
  | { kind: "start" }
  | { kind: "pending"; attempt: Attempt }
  | { kind: "failed"; attempt: Attempt; message: string }
  | { kind: "done"; result: KioskTicketResult };

/**
 * The hall's tablet (spec 3.5). Each tap is one ticket id, so a double tap or a retry after a lost answer never
 * makes two numbers (Review Focus 1): the API returns the same ticket for an id it has seen.
 */
export function KioskScreen() {
  const t = useTranslations("kiosk");
  const lanes = useTranslations("lanes");
  const [kioskKey] = useState(() => location.hash.slice(1) || null);
  const { store, status } = useKeyQueue("kiosk", kioskKey);
  const [phase, setPhase] = useState<Phase>({ kind: "start" });
  const sending = useRef(false);
  const [ended, setEnded] = useState(false);
  const reset = useCallback(() => setPhase({ kind: "start" }), []);

  async function send(attempt: Attempt) {
    if (sending.current || !kioskKey) return;
    sending.current = true;
    setPhase({ kind: "pending", attempt });
    try {
      const result = await api<KioskTicketResult>("/api/kiosk/tickets", {
        method: "POST",
        json: attempt,
        auth: false,
        headers: { "x-kiosk-key": kioskKey },
      });
      setPhase({ kind: "done", result });
    } catch (err) {
      if (err instanceof ApiError && err.code === "session_expired") setEnded(true);
      const message =
        err instanceof ApiError && (err.code === "rate_limited" || err.status === 429)
          ? t("slowDown")
          : err instanceof ApiError && err.status !== 0
            ? err.message
            : t("offline");
      setPhase({ kind: "failed", attempt, message });
    } finally {
      sending.current = false;
    }
  }

  if (status === "ended" || ended) return <DemoEnded />;
  if (status === "invalid") return <LinkInvalid />;
  if (!kioskKey) return <main className="grid min-h-dvh place-items-center p-8 text-center text-2xl">{t("missingKey")}</main>;
  if (phase.kind === "done") return <KioskTicket result={phase.result} onDone={reset} />;

  const busy = phase.kind === "pending";
  const waiting = store.snapshot?.waiting;
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6 py-10">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
        <BrandMark size={48} />
          <h1 className="font-heading text-3xl font-bold">{store.snapshot?.barangay.name ?? t("title")}</h1>
        </div>
        <LanguageToggle />
      </header>
      <ConnectionBanner status={status} />
      <p className="text-xl">{t("pick")}</p>
      <div className="flex flex-col gap-4">
        {LANES.map((lane) => (
          <button
            key={lane}
            disabled={busy}
            onClick={() => void send({ lane, id: crypto.randomUUID() })}
            className="flex min-h-28 items-center justify-between gap-4 rounded-card bg-surface px-8 py-6 text-left shadow-card disabled:opacity-60"
          >
            <span className="flex flex-col">
              <span className="font-heading text-4xl font-bold">{lanes(lane)}</span>
              {lane === "PRIORITY" && <span className="text-lg text-muted">{lanes("priorityHint")}</span>}
            </span>
            {waiting && <span className="text-lg text-muted">{t("waiting", { count: waiting[lane] })}</span>}
          </button>
        ))}
      </div>
      <LiveRegion className="flex flex-col items-start gap-3 text-lg">
        {busy && <p>{t("printing")}</p>}
        {phase.kind === "failed" && (
          <>
            <p className="text-danger">{phase.message}</p>
            <Button onClick={() => void send(phase.attempt)}>{t("retry")}</Button>
          </>
        )}
      </LiveRegion>
    </main>
  );
}
