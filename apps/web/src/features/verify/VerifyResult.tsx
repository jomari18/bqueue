"use client";

import { normalizeVerificationCode, type VerifyResult as VerifyView } from "@bq/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui";
import { asLocale } from "@/i18n/locale";
import { api, ApiError } from "@/lib/api/client";
import { formatManilaDate } from "@/lib/format";

const TONES = { VALID: "valid", EXPIRED: "warning", REVOKED: "danger" } as const;
const TONE_CLASS = { valid: "border-accent bg-accent-tint", warning: "border-warning", danger: "border-danger", missing: "border-line" };

/** The public answer for one code: only the type, the name, the dates and the barangay (spec 13). */
export function VerifyResult({ code }: { code: string }) {
  const t = useTranslations("verify");
  const locale = asLocale(useLocale());
  const normalized = normalizeVerificationCode(code);
  const query = useQuery({
    queryKey: ["verify", normalized],
    queryFn: () => api<VerifyView>(`/api/verify/${encodeURIComponent(code)}`, { auth: false }),
    enabled: normalized !== null,
    retry: false,
  });

  if (normalized && query.isPending) return <p className="text-muted">{t("checking")}</p>;
  const missing = !normalized || (query.error instanceof ApiError && query.error.status === 404);
  if (query.isError && !missing) return <p className="text-danger">{t("failed")}</p>;

  const v = missing ? null : query.data!;
  const tone = v ? TONES[v.status] : "missing";
  return (
    <Card data-testid="verify-status" data-tone={tone} className={`flex flex-col gap-3 border-2 ${TONE_CLASS[tone]}`}>
      <h2 className="font-heading text-2xl font-bold">{v ? t(`status.${v.status}`) : t("status.NOT_FOUND")}</h2>
      {v ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">{t("document")}</dt>
          <dd className="font-serif font-medium">{locale === "fil" ? v.documentName.fil : v.documentName.en}</dd>
          <dt className="text-muted">{t("name")}</dt>
          <dd>{v.fullName}</dd>
          <dt className="text-muted">{t("issued")}</dt>
          <dd>{formatManilaDate(v.issuedAt, locale)}</dd>
          <dt className="text-muted">{t("validUntil")}</dt>
          <dd>{formatManilaDate(v.validUntil, locale)}</dd>
          <dt className="text-muted">{t("barangay")}</dt>
          <dd>{`${v.barangay.name}, ${v.barangay.city}`}</dd>
        </dl>
      ) : (
        <p className="text-muted">{t("notFoundHint")}</p>
      )}
    </Card>
  );
}
