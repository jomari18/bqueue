import type { QueueSnapshot } from "@bq/shared";
import { useTranslations } from "next-intl";

export function RecentCalls({ calls }: { calls: QueueSnapshot["lastCalls"] }) {
  const t = useTranslations("display");
  return (
    <section className="flex flex-col gap-3">
      <h2 id="recent-calls" className="font-heading text-2xl font-bold">
        {t("recent")}
      </h2>
      <ul aria-labelledby="recent-calls" className="flex gap-3">
        {calls.slice(0, 5).map((c) => (
          <li key={`${c.code}-${c.calledAt}`} className="flex flex-col rounded-card bg-surface px-5 py-3 shadow-card">
            <span className="font-heading text-4xl font-bold">{c.code}</span>
            <span className="text-lg text-muted">{c.counterName}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
