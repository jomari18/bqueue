// The language is chosen with the EN/FIL toggle and kept in a cookie; URLs carry no locale (spec 12).
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALES = ["en", "fil"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const asLocale = (value: string | undefined | null): Locale => (value === "fil" ? "fil" : DEFAULT_LOCALE);

/** The locale on the client, from the cookie. */
export function currentLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=(\w+)/);
  return asLocale(match?.[1]);
}

export function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
