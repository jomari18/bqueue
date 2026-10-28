import Link from "next/link";
import { useTranslations } from "next-intl";
import { BrandMark } from "@/components/ui";

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";
const OFL = "SIL Open Font License 1.1";

// The credit texts stay in English, word for word as the licences ask (spec 11.1); only the headings translate.
const FONTS = [
  { name: "Sora", by: "Jonathan Barnbrook and Julián Moncada", use: "headings, the brand and the 3D ticket's numbers" },
  { name: "Inter", by: "Rasmus Andersson", use: "body text" },
  { name: "Noto Serif", by: "Google", use: "card titles and the display brand" },
];
const LIBRARIES = [
  "three.js, React Three Fiber and drei (MIT License) for the 3D ticket",
  "qrcode (MIT License) for the QR codes on tickets and documents",
  "Socket.io (MIT License) for the live queue",
];

/** Spec 11.1: who made what B.Queue builds on. */
export function CreditsContent() {
  const t = useTranslations("credits");
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold">
        <BrandMark size={32} /> B.Queue
      </Link>
      <h1 className="font-heading text-4xl font-bold">{t("title")}</h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-xl font-bold">{t("design")}</h2>
        <p>
          UI adapted from &quot;Donka Help Desk — Internal Request System&quot; by Dayse (Figma Community), licensed under CC BY 4.0 ({CC_BY}).
          Changes: forest green accent, new brand, barangay screens and content, icons.
        </p>
        <p className="text-sm text-muted">
          <a href="https://www.figma.com/community/file/1632877364892925660/donka-help-desk-internal-request-system" className="underline">
            Donka on Figma Community
          </a>{" "}
          ·{" "}
          <a href={CC_BY} className="underline">
            CC BY 4.0
          </a>
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-xl font-bold">{t("scene")}</h2>
        <p>3D scene inspired by &quot;Reeded liquid glass – Prism hero section concept&quot; on Spline, rebuilt from primitives; no files from it are used.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-xl font-bold">{t("fonts")}</h2>
        <ul className="flex flex-col gap-1">
          {FONTS.map((f) => (
            <li key={f.name}>
              {f.name} by {f.by}, {OFL}: {f.use}.
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-xl font-bold">{t("icons")}</h2>
        <p>Lucide icons, ISC License.</p>
        <ul className="flex flex-col gap-1 text-muted">
          {LIBRARIES.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-xl font-bold">{t("sounds")}</h2>
        <p>{t("soundsBody")}</p>
      </section>
    </main>
  );
}
