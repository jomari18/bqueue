"use client";

import type { RequestStatus } from "@bq/shared";
import { useTranslations } from "next-intl";

const STEPS: RequestStatus[] = ["SUBMITTED", "FOR_APPROVAL", "READY_FOR_PICKUP", "RELEASED"];

/** Donka's Explore cards joined by connector dots, as a request's status timeline. */
export function RequestTimeline({ status }: { status: RequestStatus }) {
  const t = useTranslations("status");
  if (status === "REJECTED" || status === "CANCELLED") {
    return <p className="font-medium text-danger">{t(status)}</p>;
  }
  const reached = STEPS.indexOf(status);
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
      {STEPS.map((step, i) => (
        <li key={step} className="flex items-center gap-2 sm:flex-1">
          <span
            aria-hidden
            className={`size-3 shrink-0 rounded-pill ${i <= reached ? "bg-accent" : "bg-line"} ${i === reached ? "ring-4 ring-accent-tint" : ""}`}
          />
          <span className={`text-sm ${i === reached ? "font-semibold text-accent-ink" : i < reached ? "text-text" : "text-muted"}`} aria-current={i === reached ? "step" : undefined}>
            {t(step)}
          </span>
          {i < STEPS.length - 1 && <span aria-hidden className={`hidden h-0.5 flex-1 sm:block ${i < reached ? "bg-accent" : "bg-line"}`} />}
        </li>
      ))}
    </ol>
  );
}
