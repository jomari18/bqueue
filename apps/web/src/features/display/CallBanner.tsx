import type { QueueCalledEvent } from "@bq/shared";
import { useTranslations } from "next-intl";

/** The number being called, as large as the TV allows (spec 10: at least 160 px at 1080p). */
export function CallBanner({ call, pulse }: { call: Pick<QueueCalledEvent, "code" | "counterName"> | null; pulse: boolean }) {
  const t = useTranslations("display");
  return (
    <section
      data-testid="call-banner"
      className={`flex flex-col items-center justify-center gap-4 rounded-card bg-accent p-8 text-on-accent ${pulse ? "animate-call" : ""}`}
    >
      <p className="font-heading text-4xl font-semibold uppercase tracking-wide">{t("nowServing")}</p>
      {call ? (
        <>
          <p className="tv-number font-heading font-bold">{call.code}</p>
          <p className="font-heading text-5xl font-semibold">{call.counterName}</p>
        </>
      ) : (
        <p className="font-heading text-4xl">{t("noCalls")}</p>
      )}
    </section>
  );
}
