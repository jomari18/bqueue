"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

/** A TV, kiosk or tracker whose key or token the API no longer knows: say so instead of reconnecting forever. */
export function LinkInvalid() {
  const t = useTranslations("demoEnded");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-heading text-3xl font-bold">{t("linkTitle")}</h1>
      <p className="text-muted">{t("linkBody")}</p>
      <Link href="/" className="inline-flex min-h-12 items-center rounded-pill bg-accent px-6 font-semibold text-on-accent">
        {t("start")}
      </Link>
    </main>
  );
}
