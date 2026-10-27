import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <Link href="/" className="inline-flex min-h-12 items-center rounded-pill bg-accent px-5 font-semibold text-on-accent">
        {t("home")}
      </Link>
    </main>
  );
}
