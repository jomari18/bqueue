"use client";

import type { RequestSummary } from "@bq/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card, Pill } from "@/components/ui";
import { asLocale } from "@/i18n/locale";
import { api } from "@/lib/api/client";
import { formatManilaDate } from "@/lib/format";
import { RevokeDialog } from "./RevokeDialog";

/** Released documents; one issued by mistake can be revoked so its QR check says so (spec 3.4, 3.6). */
export function ReleasedList() {
  const t = useTranslations("released");
  const locale = asLocale(useLocale());
  const [revoking, setRevoking] = useState<RequestSummary | null>(null);
  const released = useQuery({
    queryKey: ["requests", "RELEASED"],
    queryFn: () => api<RequestSummary[]>("/api/requests?status=RELEASED"),
  });
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-xl font-bold">{t("title")}</h2>
      {released.data?.length === 0 && <p className="text-muted">{t("empty")}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {(released.data ?? []).map((r) => (
          <article key={r.id}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-serif font-medium">{locale === "fil" ? r.documentType.nameFil : r.documentType.nameEn}</h3>
                {r.revokedAt && <Pill tone="danger">{t("revoked")}</Pill>}
              </div>
              <p className="font-medium">{r.resident.fullName}</p>
              <p className="text-sm text-muted">
                {r.verificationCode} · {formatManilaDate(r.updatedAt, locale)}
              </p>
              {!r.revokedAt && (
                <Button variant="ghost" className="self-start" onClick={() => setRevoking(r)}>
                  {t("revoke")}
                </Button>
              )}
              {revoking?.id === r.id && <RevokeDialog request={r} onClose={() => setRevoking(null)} />}
            </Card>
          </article>
        ))}
      </div>
    </section>
  );
}
