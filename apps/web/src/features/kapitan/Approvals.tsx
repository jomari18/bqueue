"use client";

import { formatPeso, type MeView, type RequestSummary } from "@bq/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { asLocale } from "@/i18n/locale";
import { api, ApiError } from "@/lib/api/client";
import { ApproveDialog } from "./ApproveDialog";

/** Requests the staff forwarded: the kapitan approves and signs, or rejects with a reason (spec 3.4). */
export function Approvals() {
  const t = useTranslations("approvals");
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MeView>("/api/me") });
  const requests = useQuery({
    queryKey: ["requests", "FOR_APPROVAL"],
    queryFn: () => api<RequestSummary[]>("/api/requests?status=FOR_APPROVAL"),
  });
  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
      {requests.data?.length === 0 && <p className="text-muted">{t("empty")}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(requests.data ?? []).map((r) => (
          <ApprovalCard key={r.id} request={r} signer={me.data?.user.displayName ?? ""} />
        ))}
      </div>
    </section>
  );
}

function ApprovalCard({ request, signer }: { request: RequestSummary; signer: string }) {
  const t = useTranslations("approvals");
  const locale = asLocale(useLocale());
  const client = useQueryClient();
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
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
        <h2 className="font-serif text-lg font-medium">{locale === "fil" ? request.documentType.nameFil : request.documentType.nameEn}</h2>
        <p className="font-medium">{request.resident.fullName}</p>
        <p className="text-muted">
          {request.purpose}
          {request.businessName ? ` · ${request.businessName}` : ""} · {request.feeCentavos === 0 ? t("free") : formatPeso(request.feeCentavos)}
        </p>
        {mode === "reject" ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span>{t("reason")}</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} className="rounded-input border border-line bg-raised p-2" />
            </label>
            <div className="flex gap-2">
              <Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => void act("reject")}>
                {t("rejectConfirm")}
              </Button>
              <Button variant="secondary" onClick={() => setMode("idle")}>
                {t("back")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMode("approve")}>{t("approve")}</Button>
            <Button variant="secondary" onClick={() => setMode("reject")}>
              {t("reject")}
            </Button>
          </div>
        )}
        {mode === "approve" && <ApproveDialog signer={signer} busy={busy} onConfirm={() => void act("approve")} onClose={() => setMode("idle")} />}
        <p aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      </Card>
    </article>
  );
}
