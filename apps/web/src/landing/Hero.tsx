"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { TryDemoButton } from "./TryDemoButton";

/** Donka's Cover as B.Queue's hero (spec 11.3): brand and promise on the left, floating cards, the stage on the right. */
export function Hero({ stage, wakeIntervalMs }: { stage?: ReactNode; wakeIntervalMs?: number }) {
  const t = useTranslations("landing");
  const brand = useTranslations("brand");
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="absolute -left-40 bottom-0 -z-10 size-[36rem] rounded-full bg-accent-tint blur-3xl" />
      <div aria-hidden="true" className="absolute -right-32 -top-32 -z-10 size-[30rem] rounded-full bg-lime/25 blur-3xl" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <h1 className="flex flex-col">
            <span className="font-display text-6xl font-semibold text-accent sm:text-7xl">{brand("name")}</span>
            <span className="font-heading text-5xl font-bold leading-[1.05] text-text sm:text-6xl">{t("headline")}</span>
          </h1>
          <p className="max-w-md text-lg text-muted">{brand("tagline")}</p>
          <TryDemoButton wakeIntervalMs={wakeIntervalMs} />
          <p className="max-w-md text-sm text-muted">{t("demoNote")}</p>
          <div className="relative mt-4 hidden h-40 sm:block">
            <FloatingCard className="left-0 top-0 w-56" label={t("cardServingLabel")} value="D-012" hint={t("cardServingHint")} />
            <FloatingCard className="left-44 top-16 w-64" label={t("cardReadyLabel")} value={t("cardReadyValue")} hint={t("cardReadyHint")} />
          </div>
        </div>
        <div className="relative">
          <p className="mb-2 flex items-end gap-2 pl-6 text-muted">
            <svg aria-hidden="true" width="56" height="40" viewBox="0 0 56 40" fill="none" className="shrink-0 text-muted">
              <path d="M52 6C30 2 10 10 8 34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M2 28l6 7 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="max-w-xs text-lg">{t("annotation")}</span>
          </p>
          <div className="aspect-[4/3] w-full">{stage ?? <TicketStill />}</div>
        </div>
      </div>
    </section>
  );
}

function FloatingCard({ className, label, value, hint }: { className: string; label: string; value: string; hint: string }) {
  return (
    <div className={`absolute flex flex-col gap-1 rounded-card bg-surface/90 p-4 shadow-card backdrop-blur ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="font-heading text-2xl font-bold text-accent-ink">{value}</span>
      <span className="text-sm text-muted">{hint}</span>
    </div>
  );
}

/** The B.Queue ticket drawn flat, for a Hero without a stage. */
export function TicketStill() {
  return (
    <div className="grid size-full place-items-center rounded-card bg-gradient-to-br from-accent-tint to-bg">
      <div className="flex w-4/5 flex-col items-center gap-2 rounded-[28px] bg-accent px-6 py-8 text-on-accent shadow-card ring-2 ring-lime sm:w-3/5 sm:px-8 sm:py-10">
        <span className="font-heading text-5xl font-bold sm:text-7xl">B.Queue</span>
      </div>
    </div>
  );
}
