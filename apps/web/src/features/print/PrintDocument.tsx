"use client";

import { type DocumentData, formatPeso, formatVerificationCode } from "@bq/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { QrCode } from "@/components/QrCode";
import { BrandMark, Button } from "@/components/ui";
import { DemoEnded } from "@/features/demo/DemoEnded";
import { useBootSession } from "@/features/shell/useBootSession";
import { asLocale } from "@/i18n/locale";
import { api, ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { formatManilaDate, formatManilaTime } from "@/lib/format";
import "./print.css";

const manilaYear = (iso: string) => Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Manila", year: "numeric" }).format(new Date(iso)));

/** The A4 document staff print at pickup. It opens in a new tab, so it restores the session itself. */
export function PrintDocument({ id, wakeIntervalMs }: { id: string; wakeIntervalMs?: number }) {
  const t = useTranslations("print");
  const shell = useTranslations("shell");
  const router = useRouter();
  const { status, waking } = useBootSession({ wakeIntervalMs });
  const { session } = useSession();
  const doc = useQuery({
    queryKey: ["document", id],
    queryFn: () => api<DocumentData>(`/api/requests/${id}/document`),
    enabled: Boolean(session),
    retry: false,
  });

  useEffect(() => {
    if (status === "signed-out") router.replace("/login");
  }, [status, router]);

  if (status === "ended") return <DemoEnded />;
  if (doc.error instanceof ApiError && doc.error.code === "invalid_transition") return <Notice text={t("notReleased")} />;
  if (doc.isError) return <Notice text={t("failed")} />;
  if (!doc.data) return <Notice text={waking ? shell("waking") : shell("loading")} />;
  return <Sheet data={doc.data} />;
}

function Notice({ text }: { text: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-center text-muted" aria-live="polite">
      {text}
    </main>
  );
}

function Sheet({ data }: { data: DocumentData }) {
  const t = useTranslations("print");
  const locale = asLocale(useLocale());
  const { request: r, resident, barangay } = data;
  const issuedAt = data.releasedAt ?? r.updatedAt;
  const years = Math.max(0, manilaYear(issuedAt) - resident.residentSince);
  const code = r.verificationCode ? formatVerificationCode(r.verificationCode) : null;
  const signedOn = data.approvedAt ? `${formatManilaDate(data.approvedAt, locale)}, ${formatManilaTime(data.approvedAt, locale)}` : "";

  return (
    <main className="min-h-dvh bg-raised py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end px-4">
        <Button onClick={() => window.print()}>{t("print")}</Button>
      </div>
      <article className="print-sheet flex flex-col gap-8 shadow-card">
        <header className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-muted">{t("republic")}</p>
            <p className="font-heading text-2xl font-bold">{barangay.name}</p>
            <p className="text-muted">{barangay.city}</p>
          </div>
          <span role="img" aria-label="B.Queue">
            <BrandMark size={56} />
          </span>
        </header>

        <h1 className="text-center font-serif text-3xl font-semibold">
          {r.documentType.nameEn}
          <span className="mt-1 block text-xl font-normal text-muted">{r.documentType.nameFil}</span>
        </h1>

        <section data-testid="certification" className="flex flex-col gap-4 font-serif text-lg leading-relaxed">
          <p>{t("toWhom")}</p>
          <p>
            {t("body", {
              name: resident.fullName,
              civil: t(`civil.${resident.civilStatus}`),
              purok: resident.purok,
              address: resident.addressLine,
              city: barangay.city,
              barangay: barangay.name,
              years,
            })}
          </p>
          {r.businessName && <p>{t("business", { business: r.businessName })}</p>}
          <p>{t("purpose", { purpose: r.purpose })}</p>
        </section>

        <section className="flex flex-col gap-1">
          <p>{r.feeCentavos === 0 ? t("free") : t("fee", { fee: formatPeso(r.feeCentavos), or: r.orNumber ?? "—" })}</p>
          <p>{t("issued", { date: formatManilaDate(issuedAt, locale) })}</p>
          {r.validUntil && <p>{t("validUntil", { date: formatManilaDate(r.validUntil, locale) })}</p>}
        </section>

        <footer className="mt-auto flex items-end justify-between gap-6">
          <div className="max-w-sm">
            <p className="font-heading text-lg font-bold">{data.kapitan.displayName}</p>
            <p className="text-sm text-muted">{t("signed", { name: data.kapitan.displayName, date: signedOn })}</p>
          </div>
          {code && (
            <div className="flex flex-col items-center gap-1">
              <QrCode value={`${location.origin}/verify/${code}`} size={120} label={t("scan")} />
              <p className="font-mono text-sm tracking-widest">{code}</p>
            </div>
          )}
        </footer>
      </article>
    </main>
  );
}
