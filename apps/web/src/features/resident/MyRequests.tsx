"use client";

import { formatPeso, type RequestSummary } from "@bq/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import { asLocale } from "@/i18n/locale";
import { api, ApiError } from "@/lib/api/client";
import { formatManilaDate } from "@/lib/format";
import { RequestTimeline } from "./RequestTimeline";

/** "My requests": each with its live timeline; request:updated events refresh the list. */
export function MyRequests() {
  const t = useTranslations("resident");
  const locale = asLocale(useLocale());
  const requests = useQuery({ queryKey: ["requests"], queryFn: () => api<RequestSummary[]>("/api/requests") });

  return (
    <section className="flex flex-col gap-4 pt-4">
      <h1 className="font-heading text-2xl font-bold">{t("myRequests")}</h1>
      {requests.data?.length === 0 && <p className="text-muted">{t("noRequests")}</p>}
      {(requests.data ?? []).map((r) => (
        <Card key={r.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link href={`/r/requests/${r.id}`} className="font-serif text-xl font-medium hover:underline">
              {locale === "fil" ? r.documentType.nameFil : r.documentType.nameEn}
            </Link>
            <span className="text-sm text-muted">{formatManilaDate(r.createdAt, locale)}</span>
          </div>
          <p className="text-muted">
            {r.purpose} · {r.feeCentavos === 0 ? t("free") : formatPeso(r.feeCentavos)}
          </p>
          <RequestTimeline status={r.status} />
          {r.rejectReason && <p className="text-danger">{r.rejectReason}</p>}
          <RequestActions request={r} />
        </Card>
      ))}
    </section>
  );
}

function RequestActions({ request }: { request: RequestSummary }) {
  const t = useTranslations("resident");
  const router = useRouter();
  const client = useQueryClient();
  const pickupId = useRef(crypto.randomUUID());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await api(`/api/requests/${request.id}/cancel`, { method: "POST" });
      await client.invalidateQueries({ queryKey: ["requests"] });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function pickup() {
    setBusy(true);
    try {
      await api("/api/queue/tickets", { method: "POST", json: { id: pickupId.current, lane: "DOCUMENTS", requestId: request.id } });
    } catch (err) {
      // Already in the Documents line: the ticket page shows that number.
      if (!(err instanceof ApiError && err.code === "already_in_queue")) {
        setBusy(false);
        throw err;
      }
    }
    await client.invalidateQueries({ queryKey: ["tickets", "mine"] });
    router.push("/r/ticket");
  }

  if (request.status === "READY_FOR_PICKUP") {
    return (
      <Button onClick={() => void pickup()} disabled={busy}>
        {t("pickup")}
      </Button>
    );
  }
  if (request.status !== "SUBMITTED") return null;
  return confirming ? (
    <div className="flex flex-wrap items-center gap-2">
      <span>{t("cancelConfirm")}</span>
      <Button variant="danger" onClick={() => void cancel()} disabled={busy}>
        {t("cancelYes")}
      </Button>
      <Button variant="secondary" onClick={() => setConfirming(false)}>
        {t("cancelNo")}
      </Button>
    </div>
  ) : (
    <Button variant="secondary" onClick={() => setConfirming(true)}>
      {t("cancel")}
    </Button>
  );
}
