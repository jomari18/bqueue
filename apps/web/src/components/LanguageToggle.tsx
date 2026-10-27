"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { asLocale, LOCALES, writeLocaleCookie } from "@/i18n/locale";

/** EN | FIL on every screen (spec 12): saves the choice in a cookie and re-renders with the new messages. */
export function LanguageToggle() {
  const t = useTranslations("language");
  const locale = asLocale(useLocale());
  const router = useRouter();
  return (
    <div role="group" aria-label={t("label")} className="inline-flex rounded-pill bg-raised p-1">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={locale === l}
          onClick={() => {
            writeLocaleCookie(l);
            router.refresh();
          }}
          className={`min-h-10 min-w-12 rounded-pill px-3 text-sm font-semibold ${locale === l ? "bg-surface text-accent-ink shadow-card" : "text-muted"}`}
        >
          {t(l)}
        </button>
      ))}
    </div>
  );
}
