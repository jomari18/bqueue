import { type Lane, LANES } from "@bq/shared";
import { useTranslations } from "next-intl";

export function WaitingByLane({ waiting }: { waiting: Record<Lane, number> | null }) {
  const t = useTranslations("display");
  const lanes = useTranslations("lanes");
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-2xl font-bold">{t("waiting")}</h2>
      <dl className="grid grid-cols-3 gap-3">
        {LANES.map((l) => (
          <div key={l} className="flex flex-col rounded-card bg-surface px-5 py-3 shadow-card">
            <dt className="text-lg text-muted">{lanes(l)}</dt>
            <dd className="font-heading text-4xl font-bold">{waiting?.[l] ?? 0}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
