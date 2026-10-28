"use client";

import { formatPeso, type RequestSummary } from "@bq/shared";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";

const OR_PATTERN = /^OR-\d{4,10}$/i;

/** Pickup release (spec 3.3): the ID was shown, the OR number when the fee is above zero, then print. */
export function ReleaseDialog({ request, onDone, onClose }: { request: RequestSummary; onDone: () => void; onClose: () => void }) {
  const t = useTranslations("release");
  const [idChecked, setIdChecked] = useState(false);
  const [orNumber, setOrNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [released, setReleased] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paid = request.feeCentavos > 0;
  const ready = idChecked && (!paid || OR_PATTERN.test(orNumber.trim()));

  async function release() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/requests/${request.id}/release`, {
        method: "POST",
        json: { idChecked: true, ...(paid ? { orNumber: orNumber.trim().toUpperCase() } : {}) },
      });
      setReleased(true);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card role="dialog" aria-label={t("title")} className="flex w-full max-w-md flex-col gap-3 border border-line text-left">
      <h2 className="font-heading text-lg font-bold">{t("title")}</h2>
      {released ? (
        <>
          <p>{t("done")}</p>
          <Link href={`/print/${request.id}`} target="_blank" className="inline-flex min-h-12 items-center justify-center rounded-pill bg-accent px-5 font-semibold text-on-accent">
            {t("print")}
          </Link>
          <Button variant="secondary" onClick={onClose}>
            {t("close")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-muted">{paid ? t("fee", { fee: formatPeso(request.feeCentavos) }) : t("free")}</p>
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" checked={idChecked} onChange={(e) => setIdChecked(e.target.checked)} className="size-6" />
            <span>{t("idChecked")}</span>
          </label>
          {paid && (
            <label className="flex flex-col gap-1">
              <span>{t("orNumber")}</span>
              <input value={orNumber} onChange={(e) => setOrNumber(e.target.value)} placeholder="OR-2026001" className="min-h-12 rounded-input border border-line bg-raised px-3" />
            </label>
          )}
          <p aria-live="polite" className="text-sm text-danger">
            {error}
          </p>
          <div className="flex gap-2">
            <Button disabled={!ready || busy} onClick={() => void release()}>
              {t("submit")}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
