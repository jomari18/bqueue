"use client";

import { formatPeso, type ReportSummary } from "@bq/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card } from "@/components/ui";
import { api } from "@/lib/api/client";
import { BarChart } from "./BarChart";

type Range = ReportSummary["range"];
const RANGES: Range[] = ["today", "7d", "30d"];

const minutes = (seconds: number | null) => (seconds === null ? "—" : String(Math.round(seconds / 60)));
const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

/** The no-show rate across lanes, weighted by how many tickets each lane had. */
function overallNoShow(lanes: ReportSummary["queue"]["lanes"]): number | null {
  const counted = lanes.filter((l) => l.noShowRate !== null && l.tickets > 0);
  const tickets = counted.reduce((sum, l) => sum + l.tickets, 0);
  return tickets === 0 ? null : counted.reduce((sum, l) => sum + l.noShowRate! * l.tickets, 0) / tickets;
}

/** Spec 3.4: what the barangay released and collected, and how the line moved. */
export function Reports() {
  const t = useTranslations("reports");
  const lanes = useTranslations("lanes");
  const [range, setRange] = useState<Range>("today");
  const report = useQuery({ queryKey: ["reports", range], queryFn: () => api<ReportSummary>(`/api/reports/summary?range=${range}`) });
  const data = report.data;

  const byHour = data?.queue.byHour ?? [];
  const busiest = byHour.reduce((best, v, h) => (v > (byHour[best] ?? 0) ? h : best), 0);
  const summary =
    byHour.some((v) => v > 0) ? t("chartSummary", { hour: `${String(busiest).padStart(2, "0")}:00`, count: byHour[busiest] ?? 0 }) : t("chartEmpty");

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
      <div role="tablist" aria-label={t("range")} className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={range === r}
            onClick={() => setRange(r)}
            className={`min-h-12 rounded-pill px-5 font-semibold ${range === r ? "bg-accent text-on-accent" : "bg-raised"}`}
          >
            {t(`ranges.${r}`)}
          </button>
        ))}
      </div>
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("released")} value={String(data.requests.released)} />
            <Stat label={t("fees")} value={formatPeso(data.requests.feesCollectedCentavos)} />
            <Stat label={t("avgDays")} value={data.requests.avgDaysToReady === null ? "—" : data.requests.avgDaysToReady.toFixed(1)} />
            <Stat label={t("noShow")} value={percent(overallNoShow(data.queue.lanes))} />
          </div>
          <Card className="flex flex-col gap-2">
            <h2 className="font-heading text-lg font-bold">{t("byHour")}</h2>
            <BarChart values={byHour} labels={byHour.map((_, h) => String(h))} summary={summary} />
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full text-left">
              <caption className="pb-2 text-left font-heading text-lg font-bold">{t("lanesTitle")}</caption>
              <thead className="text-sm text-muted">
                <tr>
                  <th scope="col">{t("lane")}</th>
                  <th scope="col">{t("tickets")}</th>
                  <th scope="col">{t("avgWait")}</th>
                  <th scope="col">{t("avgService")}</th>
                  <th scope="col">{t("noShowCol")}</th>
                </tr>
              </thead>
              <tbody>
                {data.queue.lanes.map((l) => (
                  <tr key={l.lane} className="border-t border-line">
                    <th scope="row" className="py-2 font-medium">
                      {lanes(l.lane)}
                    </th>
                    <td>{l.tickets}</td>
                    <td>{minutes(l.avgWaitSeconds)}</td>
                    <td>{minutes(l.avgServiceSeconds)}</td>
                    <td>{percent(l.noShowRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-heading text-3xl font-bold">{value}</span>
    </Card>
  );
}
