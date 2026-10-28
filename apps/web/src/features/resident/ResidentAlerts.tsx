"use client";

import { useTranslations } from "next-intl";
import { Button, LiveRegion } from "@/components/ui";
import { useMyTickets } from "@/lib/realtime/hooks";
import { useTicketAlerts } from "./useTicketAlerts";

/**
 * Spec 10's resident alerts on every resident page, not only My ticket (final review 5): the "almost your turn"
 * banner and the full-screen "your turn" notice. The shell mounts it once for residents.
 */
export function ResidentAlerts() {
  const t = useTranslations("ticket");
  const { tickets } = useMyTickets();
  const { near, called, dismiss } = useTicketAlerts(tickets);
  // The live ticket, so the notice closes once the ticket is served or missed.
  const nearNow = near && tickets.find((x) => x.id === near.id);
  const calledNow = called && tickets.find((x) => x.id === called.id);

  return (
    <>
      {nearNow?.status === "WAITING" && (
        <p role="status" className="mx-auto mt-4 max-w-5xl rounded-card bg-accent-tint p-4 font-semibold text-accent-ink">
          {t("near")}
        </p>
      )}
      {calledNow?.status === "CALLED" && (
        <div role="alertdialog" aria-labelledby="called-title" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-accent p-6 text-center text-on-accent">
          <p className="text-2xl font-semibold">{calledNow.code}</p>
          <h2 id="called-title" className="font-heading text-5xl font-bold">
            {t("called", { counter: calledNow.counterName ?? "" })}
          </h2>
          <LiveRegion assertive>{t("called", { counter: calledNow.counterName ?? "" })}</LiveRegion>
          <Button variant="secondary" onClick={dismiss}>
            {t("ok")}
          </Button>
        </div>
      )}
    </>
  );
}
