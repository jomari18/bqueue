"use client";

import type { KioskTicketResult } from "@bq/shared";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { QrCode } from "@/components/QrCode";
import { Button, Card } from "@/components/ui";
import { etaText } from "@/lib/format";

/** The number and a QR to follow it on a phone; the kiosk goes back for the next person after 15 s. */
export function KioskTicket({ result, onDone }: { result: KioskTicketResult; onDone: () => void }) {
  const t = useTranslations("kiosk");
  const ticket = useTranslations("ticket");
  const lanes = useTranslations("lanes");
  useEffect(() => {
    const timer = setTimeout(onDone, 15_000);
    return () => clearTimeout(timer);
  }, [onDone]);
  const link = `${location.origin}/t#${result.trackingToken}`;
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <Card aria-live="polite" className="flex w-full flex-col items-center gap-4 py-10">
        <p className="text-xl text-muted">{lanes(result.ticket.lane)}</p>
        <p className="font-heading text-8xl font-bold text-accent-ink">{result.ticket.code}</p>
        <p className="text-xl">{etaText(ticket, result.ticket.ahead, result.ticket.etaMinutes)}</p>
        <QrCode value={link} size={220} label={t("scan")} />
        <p className="text-muted">{t("scan")}</p>
      </Card>
      <Button className="px-10 text-lg" onClick={onDone}>
        {t("done")}
      </Button>
    </main>
  );
}
