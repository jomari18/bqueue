"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { clearDemo } from "@/lib/auth/demo-store";

/** A recruiter who comes back the next day sees this instead of an endless "Reconnecting…" (Review Focus 4). */
export function DemoEnded() {
  const t = useTranslations("demoEnded");
  useEffect(() => clearDemo(), []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <Link href="/" className="inline-flex min-h-12 items-center rounded-pill bg-accent px-6 font-semibold text-on-accent">
        {t("start")}
      </Link>
    </main>
  );
}
