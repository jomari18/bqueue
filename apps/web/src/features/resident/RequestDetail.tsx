"use client";

import type { RequestView } from "@bq/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui";
import { asLocale } from "@/i18n/locale";
import { api } from "@/lib/api/client";
import { formatManilaDate, formatManilaTime } from "@/lib/format";
import { RequestTimeline } from "./RequestTimeline";

/** One request with its full history (RequestEvent rows), kept live by request:updated. */
export function RequestDetail({ id }: { id: string }) {
  const status = useTranslations("status");
  const locale = asLocale(useLocale());
  const { data } = useQuery({ queryKey: ["request", id], queryFn: () => api<RequestView>(`/api/requests/${id}`) });
  if (!data) return null;
  return (
    <Card className="mt-4 flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-medium">{locale === "fil" ? data.documentType.nameFil : data.documentType.nameEn}</h1>
      <p className="text-muted">{data.purpose}</p>
      <RequestTimeline status={data.status} />
      <ol className="flex flex-col gap-2 border-l-2 border-accent-tint pl-4">
        {(data.events ?? []).map((e, i) => (
          <li key={i}>
            <span className="font-medium">{status(e.toStatus)}</span>{" "}
            <span className="text-sm text-muted">
              {formatManilaDate(e.createdAt, locale)} {formatManilaTime(e.createdAt, locale)}
              {e.actorName ? ` · ${e.actorName}` : ""}
            </span>
            {e.note && <p className="text-sm">{e.note}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
