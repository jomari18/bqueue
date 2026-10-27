"use client";

import type { DocumentTypeView, RequestView } from "@bq/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";

const QUICK = ["employment", "school", "bank", "travel", "others"] as const;

/**
 * One client id per form, kept until the request is saved: a double tap or a retry after a timeout sends the same
 * id, and the API answers the stored request (Review Focus 1).
 */
export function RequestForm({ type }: { type: DocumentTypeView }) {
  const t = useTranslations("resident");
  const router = useRouter();
  const client = useQueryClient();
  const id = useRef(crypto.randomUUID());
  const sending = useRef(false);
  const purposeRef = useRef<HTMLInputElement>(null);
  const [purpose, setPurpose] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState<{ message: string; field?: string; retry?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await api<{ request: RequestView; duplicate: boolean }>("/api/requests", {
        method: "POST",
        json: { id: id.current, documentTypeId: type.id, purpose, ...(type.needsBusinessName ? { businessName } : {}) },
      });
      await client.invalidateQueries({ queryKey: ["requests"] });
      router.push("/r/requests");
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setError({ message: apiErr?.message ?? t("submitFailed"), field: apiErr?.field, retry: !apiErr || apiErr.status === 0 || apiErr.status >= 500 });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const fieldError = (field: string) => (error?.field === field ? <p className="text-sm text-danger">{error.message}</p> : null);

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("quickPurposes")}>
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              if (q === "others") purposeRef.current?.focus();
              else setPurpose(t(`purpose.${q}`));
            }}
            className="min-h-10 rounded-pill bg-accent-tint px-3 text-sm font-medium text-accent-ink"
          >
            {t(`purpose.${q}`)}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span>{t("purposeLabel")}</span>
        <input
          ref={purposeRef}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          maxLength={120}
          className="min-h-12 rounded-input border border-line bg-raised px-3"
        />
        {fieldError("purpose")}
      </label>
      {type.needsBusinessName && (
        <label className="flex flex-col gap-1">
          <span>{t("businessName")}</span>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={80} className="min-h-12 rounded-input border border-line bg-raised px-3" />
          {fieldError("businessName")}
        </label>
      )}
      <div aria-live="polite">{error && !error.field && <p className="text-danger">{error.message}</p>}</div>
      {error?.retry ? (
        <Button onClick={() => void submit()} disabled={busy}>
          {t("tryAgain")}
        </Button>
      ) : (
        <Button type="submit" disabled={busy}>
          {t("submit")}
        </Button>
      )}
    </form>
  );
}
