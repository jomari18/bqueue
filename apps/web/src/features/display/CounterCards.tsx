import type { QueueSnapshot } from "@bq/shared";
import { useTranslations } from "next-intl";

/** One card per open counter with the number it is serving. */
export function CounterCards({ counters }: { counters: QueueSnapshot["counters"] }) {
  const t = useTranslations("display");
  const open = counters.filter((c) => c.open);
  return (
    <section className="flex min-h-0 flex-col gap-4">
      <h2 className="font-heading text-3xl font-bold">{t("counters")}</h2>
      <ul className="grid gap-4 overflow-hidden">
        {open.map((c) => {
          const label = `${c.name.toUpperCase()} · ${c.currentCode ?? "—"}`;
          return (
            <li key={c.id} aria-label={label} className="flex items-center justify-between rounded-card bg-surface px-6 py-4 shadow-card">
              <span className="font-heading text-3xl font-semibold uppercase">{c.name}</span>
              <span className="font-heading text-6xl font-bold text-accent-ink">{c.currentCode ?? "—"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
