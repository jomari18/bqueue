"use client";

import { useTranslations } from "next-intl";
import { BrandMark, Button } from "@/components/ui";
import type { DisplayLang } from "./DisplayScreen";

/** One tap before anything plays: browsers block sound until a person interacts with the page. */
export function StartScreen({ lang, onLang, onStart }: { lang: DisplayLang; onLang: (l: DisplayLang) => void; onStart: () => void }) {
  const t = useTranslations("display");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandMark size={64} />
      <h1 className="font-heading text-4xl font-bold">{t("startTitle")}</h1>
      <p className="text-muted">{t("startBody")}</p>
      <div role="group" aria-label={t("language")} className="flex gap-2">
        {(["fil", "en"] as const).map((l) => (
          <button
            key={l}
            aria-pressed={lang === l}
            onClick={() => onLang(l)}
            className={`min-h-12 rounded-pill px-6 font-semibold ${lang === l ? "bg-accent text-on-accent" : "bg-raised"}`}
          >
            {l === "fil" ? "Filipino" : "English"}
          </button>
        ))}
      </div>
      <Button className="px-10 text-lg" onClick={onStart}>
        {t("start")}
      </Button>
    </main>
  );
}
