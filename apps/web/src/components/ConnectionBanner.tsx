"use client";

import { useTranslations } from "next-intl";
import type { ConnectionStatus } from "@/lib/realtime/connection";

/** "Reconnecting…" while the live connection retries (spec 8.4). */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const t = useTranslations("connection");
  return (
    <div aria-live="polite" className="min-h-0">
      {status === "reconnecting" && (
        <p className="mx-auto my-2 w-fit rounded-pill bg-raised px-4 py-1 text-sm font-medium text-warning">{t("reconnecting")}</p>
      )}
    </div>
  );
}
