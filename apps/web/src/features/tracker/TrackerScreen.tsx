"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { LanguageToggle } from "@/components/LanguageToggle";
import { BrandMark, Card, LiveRegion } from "@/components/ui";
import { DemoEnded } from "@/features/demo/DemoEnded";
import { LinkInvalid } from "@/features/demo/LinkInvalid";
import { etaText } from "@/lib/format";
import { useTracker } from "@/lib/realtime/hooks";

/** /t#token from the kiosk QR: one walk-in ticket, live, without an account (spec 3.5). */
export function TrackerScreen() {
  const t = useTranslations("ticket");
  const k = useTranslations("kiosk");
  const lanes = useTranslations("lanes");
  const [token] = useState(() => location.hash.slice(1) || null);
  const { update, status } = useTracker(token);

  if (status === "ended") return <DemoEnded />;
  if (status === "invalid") return <LinkInvalid />;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <BrandMark size={36} />
        <LanguageToggle />
      </header>
      <ConnectionBanner status={status} />
      {!token && <p className="text-center">{k("missingToken")}</p>}
      {token && !update && <p className="text-center text-muted">{k("loading")}</p>}
      {update && (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-muted">{lanes(update.lane)}</p>
          <p className="font-heading text-7xl font-bold text-accent-ink">{update.code}</p>
          <LiveRegion assertive={update.status === "CALLED"} className="text-xl font-semibold">
            {update.status === "WAITING" && <p>{etaText(t, update.ahead, update.etaMinutes)}</p>}
            {update.status === "CALLED" && <p className="text-2xl text-accent-ink">{t("called", { counter: update.counterName ?? "" })}</p>}
            {update.status === "SERVED" && <p>{t("served")}</p>}
            {update.status === "MISSED" && <p className="text-danger">{t("missed")}</p>}
            {update.status === "CANCELLED" && <p className="text-muted">{t("expired")}</p>}
          </LiveRegion>
        </Card>
      )}
    </main>
  );
}
