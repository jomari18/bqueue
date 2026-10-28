"use client";

import type { MeView } from "@bq/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";

/** The practice crowd that keeps a demo barangay busy (spec 7.6); it pauses on its own when people take over. */
export function Simulator() {
  const t = useTranslations("settings");
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MeView>("/api/me") });
  const [error, setError] = useState<string | null>(null);
  if (!me.data) return null;
  const on = me.data.barangay.simulatorOn;

  async function toggle() {
    setError(null);
    try {
      await api("/api/settings/simulator", { method: "PATCH", json: { on: !on } });
      await client.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    }
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span id="sim-label" className="font-heading text-lg font-bold">
          {t("simulator")}
        </span>
        <button
          role="switch"
          aria-checked={on}
          aria-labelledby="sim-label"
          onClick={() => void toggle()}
          className={`relative h-8 w-14 rounded-pill transition-colors ${on ? "bg-accent" : "bg-line"}`}
        >
          <span className={`absolute top-1 size-6 rounded-full bg-surface shadow-card transition-all ${on ? "left-7" : "left-1"}`} />
        </button>
      </div>
      <p className="text-sm text-muted">{t("simulatorHint")}</p>
      <p aria-live="polite" className="text-sm text-danger empty:hidden">
        {error}
      </p>
    </Card>
  );
}
