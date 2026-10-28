"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-heading text-3xl font-bold">{t("errorPage.title")}</h1>
      <p className="text-muted">{t("errorPage.body")}</p>
      <Button onClick={reset}>{t("common.tryAgain")}</Button>
    </main>
  );
}
