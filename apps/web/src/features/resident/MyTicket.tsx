"use client";

import type { Lane, TicketView } from "@bq/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button, Card, LiveRegion, Pill } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";
import { etaText } from "@/lib/format";
import { useMyTickets } from "@/lib/realtime/hooks";
import { useTicketAlerts } from "./useTicketAlerts";

const LANES: Lane[] = ["PRIORITY", "DOCUMENTS", "GENERAL"];

/** My ticket: today's numbers with live position and alerts, and walk-in numbers for free lanes. */
export function MyTicket() {
  const t = useTranslations("ticket");
  const { tickets } = useMyTickets();
  const { near, called, dismiss } = useTicketAlerts(tickets);
  const activeLanes = new Set(tickets.filter((x) => x.status === "WAITING" || x.status === "CALLED").map((x) => x.lane));

  return (
    <section className="flex flex-col gap-4 pt-4">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
      {near && near.status === "WAITING" && (
        <p role="status" className="rounded-card bg-accent-tint p-4 font-semibold text-accent-ink">
          {t("near")}
        </p>
      )}
      {tickets.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} />
      ))}
      <TakeNumber lanes={LANES.filter((l) => !activeLanes.has(l))} />
      {called && called.status === "CALLED" && (
        <div role="alertdialog" aria-labelledby="called-title" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-accent p-6 text-center text-on-accent">
          <p className="text-2xl font-semibold">{called.code}</p>
          <h2 id="called-title" className="font-heading text-5xl font-bold">
            {t("called", { counter: called.counterName ?? "" })}
          </h2>
          <LiveRegion assertive>{t("called", { counter: called.counterName ?? "" })}</LiveRegion>
          <Button variant="secondary" onClick={dismiss}>
            {t("ok")}
          </Button>
        </div>
      )}
    </section>
  );
}

function TicketCard({ ticket }: { ticket: TicketView }) {
  const t = useTranslations("ticket");
  const lanes = useTranslations("lanes");
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function rejoin() {
    setBusy(true);
    try {
      await api(`/api/queue/tickets/${ticket.id}/rejoin`, { method: "POST" });
      await client.invalidateQueries({ queryKey: ["tickets", "mine"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col items-center gap-3 text-center">
      <Pill>{lanes(ticket.lane)}</Pill>
      <p className="font-heading text-6xl font-bold text-accent-ink">{ticket.code}</p>
      <LiveRegion>
        {ticket.status === "WAITING" && <p className="text-lg">{etaText(t, ticket.ahead, ticket.etaMinutes)}</p>}
        {ticket.status === "CALLED" && <p className="text-lg font-semibold">{t("called", { counter: ticket.counterName ?? "" })}</p>}
        {ticket.status === "SERVED" && <p className="text-muted">{t("served")}</p>}
        {ticket.status === "CANCELLED" && <p className="text-muted">{t("expired")}</p>}
        {ticket.status === "MISSED" && <p className="text-warning">{t("missed")}</p>}
      </LiveRegion>
      {ticket.status === "MISSED" && !ticket.rejoined && (
        <Button onClick={() => void rejoin()} disabled={busy}>
          {t("rejoin")}
        </Button>
      )}
    </Card>
  );
}

function TakeNumber({ lanes: free }: { lanes: Lane[] }) {
  const t = useTranslations("ticket");
  const lanes = useTranslations("lanes");
  const client = useQueryClient();
  const ids = useRef(new Map<Lane, string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (free.length === 0) return null;

  async function take(lane: Lane) {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (!ids.current.has(lane)) ids.current.set(lane, crypto.randomUUID());
    try {
      await api("/api/queue/tickets", { method: "POST", json: { id: ids.current.get(lane), lane } });
      ids.current.delete(lane);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0 && err.status < 500) ids.current.delete(lane);
      setError(err instanceof ApiError ? err.message : t("takeFailed"));
    } finally {
      setBusy(false);
      await client.invalidateQueries({ queryKey: ["tickets", "mine"] });
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-bold">{t("getNumber")}</h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        {free.map((lane) => (
          <Button key={lane} variant="secondary" disabled={busy} onClick={() => void take(lane)} className="flex-1">
            {lanes(lane)}
            {lane === "PRIORITY" ? ` — ${lanes("priorityHint")}` : ""}
          </Button>
        ))}
      </div>
      <p aria-live="polite" className="text-sm text-danger">
        {error}
      </p>
    </Card>
  );
}
