import { getTranslations } from "next-intl/server";
import { LanguageToggle } from "@/components/LanguageToggle";
import { BrandMark } from "@/components/ui";

// Placeholder until the landing page (Task 30).
export default async function Home() {
  const t = await getTranslations("brand");
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandMark size={64} />
      <h1 className="font-serif text-5xl font-semibold">{t("name")}</h1>
      <p className="text-muted">{t("tagline")}</p>
      <LanguageToggle />
    </main>
  );
}
