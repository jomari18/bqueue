"use client";

import type { RequestSummary } from "@bq/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";

export function RevokeDialog({ request, onClose }: { request: RequestSummary; onClose: () => void }) {
  const t = useTranslations("released");
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/requests/${request.id}/revoke`, { method: "POST", json: { reason } });
      await client.invalidateQueries({ queryKey: ["requests"] });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card role="dialog" aria-label={t("dialogTitle")} className="flex flex-col gap-3 border border-line">
      <p className="text-sm text-muted">{t("warning")}</p>
      <label className="flex flex-col gap-1">
        <span>{t("reason")}</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} className="rounded-input border border-line bg-raised p-2" />
      </label>
      <p aria-live="polite" className="text-sm text-danger">
        {error}
      </p>
      <div className="flex gap-2">
        <Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => void revoke()}>
          {t("confirm")}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
      </div>
    </Card>
  );
}
