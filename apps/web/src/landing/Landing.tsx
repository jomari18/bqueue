"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { BrandMark } from "@/components/ui";
import { wakeApi } from "@/lib/api/wake";
import { FeatureSections } from "./FeatureSections";
import { Hero } from "./Hero";
import { TryDemoButton } from "./TryDemoButton";

/** The public front page. It starts waking the free API on arrival so "Try the demo" is quick (spec 7.5). */
export function Landing({ stage, wakeIntervalMs }: { stage?: ReactNode; wakeIntervalMs?: number }) {
  const t = useTranslations("landing");
  const brand = useTranslations("brand");
  useEffect(() => {
    void wakeApi(undefined, { intervalMs: wakeIntervalMs });
  }, [wakeIntervalMs]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <span className="flex items-center gap-2 font-heading text-lg font-bold">
          <BrandMark size={32} /> {brand("name")}
        </span>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <Link href="/login" className="hidden min-h-10 items-center rounded-pill px-4 font-semibold text-accent-ink hover:bg-accent-tint sm:inline-flex">
            {t("signIn")}
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <Hero stage={stage} wakeIntervalMs={wakeIntervalMs} />
        <FeatureSections />
        <section aria-labelledby="cta-title" className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-6 pb-20">
          <h2 id="cta-title" className="font-heading text-3xl font-bold">
            {t("ctaTitle")}
          </h2>
          <p className="max-w-xl text-muted">{t("ctaBody")}</p>
          <TryDemoButton wakeIntervalMs={wakeIntervalMs} />
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-muted">
          <p>{t("footer")}</p>
          <nav className="flex gap-4">
            <Link href="/verify" className="hover:text-text">
              {t("verifyLink")}
            </Link>
            <Link href="/credits" className="hover:text-text">
              {t("credits")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
