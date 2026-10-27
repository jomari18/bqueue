import type { Locale } from "@/i18n/locale";

const intlLocale = (l: Locale) => (l === "fil" ? "fil-PH" : "en-US");

/** Dates on the Manila calendar ("Oct 28, 2026"). */
export function formatManilaDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

export function formatManilaTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** "3 ahead · about 9 min", never less than a minute; "You're next" when nobody is ahead (spec 6.9). */
export function etaText(t: Translate, ahead: number, minutes: number): string {
  return ahead === 0 ? t("next") : t("eta", { ahead, minutes: Math.max(1, minutes) });
}
