import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { BrandMark } from "@/components/ui";

/** The public verify pages: no sign-in, no rail (spec 3.6). */
export function VerifyLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("verify");
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-heading text-lg font-bold">
          <BrandMark size={32} /> B.Queue
        </span>
        <LanguageToggle />
      </header>
      <div>
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </div>
      {children}
    </main>
  );
}
