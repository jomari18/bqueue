import { FileText, type LucideIcon, MonitorSpeaker, QrCode, Ticket } from "lucide-react";
import { useTranslations } from "next-intl";

const FEATURES: { id: "requests" | "queue" | "tv" | "verify"; icon: LucideIcon }[] = [
  { id: "requests", icon: FileText },
  { id: "queue", icon: Ticket },
  { id: "tv", icon: MonitorSpeaker },
  { id: "verify", icon: QrCode },
];

/** What B.Queue does, one card per flow, joined by Donka's curved connector with dots. */
export function FeatureSections() {
  const t = useTranslations("landing.features");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16">
      <h2 className="font-heading text-3xl font-bold">{t("title")}</h2>
      <div className="grid gap-6 md:grid-cols-2">
        {FEATURES.map(({ id, icon: Icon }, i) => (
          <section key={id} data-feature={id} aria-labelledby={`feature-${id}`} className="relative flex flex-col gap-3 rounded-card bg-surface p-6 shadow-card">
            <span className="inline-flex size-12 items-center justify-center rounded-pill bg-accent-tint text-accent-ink">
              <Icon aria-hidden="true" className="size-6" />
            </span>
            <p className="text-sm font-semibold text-muted">{String(i + 1).padStart(2, "0")}</p>
            <h3 id={`feature-${id}`} className="font-serif text-2xl font-medium">
              {t(`${id}.title`)}
            </h3>
            <p className="text-muted">{t(`${id}.body`)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
