"use client";

import type { RequestSummary } from "@bq/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { asLocale } from "@/i18n/locale";
import { api, ApiError } from "@/lib/api/client";

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

/** Staff review new requests between calls: forward to the kapitan or reject with a reason (spec 3.3). */
export function RequestBoard() {
  const t = useTranslations("board");
  const requests = useQuery({
    queryKey: ["requests", "SUBMITTED"],
    queryFn: () => api<RequestSummary[]>("/api/requests?status=SUBMITTED"),
  });
  return (
    <section className="flex flex-col gap-4 pt-4">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
      {requests.data?.length === 0 && <p className="text-muted">{t("empty")}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(requests.data ?? []).map((r) => (
          <BoardCard key={r.id} request={r} />
        ))}
      </div>
    </section>
  );
}

function BoardCard({ request }: { request: RequestSummary }) {
  const t = useTranslations("board");
  const locale = asLocale(useLocale());
  const client = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "forward" | "reject") {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/requests/${request.id}/${action}`, { method: "POST", json: action === "reject" ? { reason } : undefined });
      await client.invalidateQueries({ queryKey: ["requests"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article>
      <Card className="flex h-full flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg font-medium">{locale === "fil" ? request.documentType.nameFil : request.documentType.nameEn}</h2>
          <span className="text-sm text-muted">{t("ago", { minutes: minutesAgo(request.createdAt) })}</span>
        </div>
        <p className="font-medium">{request.resident.fullName}</p>
        <p className="text-muted">
          {request.purpose}
          {request.businessName ? ` · ${request.businessName}` : ""}
        </p>
        {rejecting ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span>{t("reason")}</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} className="rounded-input border border-line bg-raised p-2" />
            </label>
            <div className="flex gap-2">
              <Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => void act("reject")}>
                {t("rejectConfirm")}
              </Button>
              <Button variant="secondary" onClick={() => setRejecting(false)}>
                {t("back")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void act("forward")}>
              {t("forward")}
            </Button>
            <Button variant="secondary" onClick={() => setRejecting(true)}>
              {t("reject")}
            </Button>
          </div>
        )}
        <p aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      </Card>
    </article>
  );
}
