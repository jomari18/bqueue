"use client";

import { type DocumentTypeView, formatPeso, parsePesos } from "@bq/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { asLocale } from "@/i18n/locale";
import { api, ApiError } from "@/lib/api/client";

/** Fees and which documents residents may request (spec 3.4). A fee change never touches submitted requests. */
export function DocumentTypes() {
  const t = useTranslations("settings");
  const types = useQuery({ queryKey: ["settings", "document-types"], queryFn: () => api<DocumentTypeView[]>("/api/settings/document-types") });
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-bold">{t("typesTitle")}</h2>
      <p className="text-sm text-muted">{t("feeNote")}</p>
      <ul className="flex flex-col gap-3">
        {(types.data ?? []).map((d) => (
          <TypeRow key={d.id} type={d} />
        ))}
      </ul>
    </Card>
  );
}

function TypeRow({ type }: { type: DocumentTypeView }) {
  const t = useTranslations("settings");
  const locale = asLocale(useLocale());
  const client = useQueryClient();
  const name = locale === "fil" ? type.nameFil : type.nameEn;
  const [fee, setFee] = useState(formatPeso(type.feeCentavos));
  const [error, setError] = useState<string | null>(null);

  async function patch(body: { feeCentavos?: number; active?: boolean }) {
    setError(null);
    try {
      await api(`/api/settings/document-types/${type.id}`, { method: "PATCH", json: body });
      await client.invalidateQueries({ queryKey: ["settings", "document-types"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    }
  }

  function saveFee() {
    const centavos = parsePesos(fee);
    if (centavos === null) return setError(t("feeInvalid"));
    void patch({ feeCentavos: centavos });
  }

  return (
    <li className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
      <div className="min-w-40 flex-1">
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted">{type.active ? t("active") : t("inactive")}</p>
      </div>
      <input
        aria-label={t("feeFor", { name })}
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        inputMode="decimal"
        className="min-h-12 w-32 rounded-input border border-line bg-raised px-3"
      />
      <Button variant="secondary" onClick={saveFee}>
        {t("saveFee")}
      </Button>
      <Button variant="ghost" onClick={() => void patch({ active: !type.active })}>
        {type.active ? t("turnOff") : t("turnOn")}
      </Button>
      <p aria-live="polite" className="w-full text-sm text-danger empty:hidden">
        {error}
      </p>
    </li>
  );
}
