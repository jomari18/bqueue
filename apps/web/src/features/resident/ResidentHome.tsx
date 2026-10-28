"use client";

import { type DocumentTypeView, formatPeso } from "@bq/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Card } from "@/components/ui";
import { api } from "@/lib/api/client";
import { RequestForm } from "./RequestForm";

/** Donka's Home composer as "Ano ang kailangan mo?": pick a document, then say what it is for. */
export function ResidentHome() {
  const t = useTranslations("resident");
  const locale = useLocale();
  const [chosen, setChosen] = useState<DocumentTypeView | null>(null);
  const types = useQuery({ queryKey: ["document-types"], queryFn: () => api<DocumentTypeView[]>("/api/document-types") });

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 pt-6">
      <h1 className="text-center font-heading text-3xl font-bold md:text-4xl">{t("homeTitle")}</h1>
      <Card className="flex flex-col gap-4">
        <p className="text-muted">{t("homeHelp")}</p>
        <div className="flex flex-wrap gap-2">
          {(types.data ?? []).map((type) => {
            const name = locale === "fil" ? type.nameFil : type.nameEn;
            const fee = type.feeCentavos === 0 ? t("free") : formatPeso(type.feeCentavos);
            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={chosen?.id === type.id}
                onClick={() => setChosen(type)}
                className={`min-h-12 rounded-pill px-4 text-left font-medium ${chosen?.id === type.id ? "bg-accent text-on-accent" : "bg-raised hover:bg-accent-tint"}`}
              >
                {name} · {fee}
              </button>
            );
          })}
        </div>
        {chosen && <RequestForm key={chosen.id} type={chosen} />}
      </Card>
    </section>
  );
}
