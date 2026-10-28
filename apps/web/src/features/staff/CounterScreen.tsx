"use client";

import { type CounterView, formatPeso, type MeView, type TicketView } from "@bq/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button, Card, LiveRegion, Pill } from "@/components/ui";
import { asLocale } from "@/i18n/locale";
import { api, ApiError } from "@/lib/api/client";
import { useQueue } from "@/lib/realtime/hooks";
import { ReleaseDialog } from "./ReleaseDialog";

/** Spec 3.3: open the counter, call next, serve, call again, mark missed, release pickups, rejoin missed numbers. */
export function CounterScreen() {
  const t = useTranslations("counter");
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MeView>("/api/me") });
  const counters = useQuery({ queryKey: ["counters"], queryFn: () => api<CounterView[]>("/api/counters") });
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ["counters"] }), client.invalidateQueries({ queryKey: ["me"] })]);

  if (!me.data || !counters.data) return null;
  const mine = counters.data.find((c) => c.id === me.data.counterId);
  if (!mine) {
    return (
      <section className="flex flex-col gap-4 pt-4">
        <h1 className="font-heading text-2xl font-bold">{t("pick")}</h1>
        <div className="flex flex-wrap gap-2">
          {counters.data.map((c) => (
            <Button
              key={c.id}
              variant="secondary"
              onClick={() => void api(`/api/counters/${c.id}/assign`, { method: "POST", json: {} }).then(refresh)}
            >
              {t("use", { name: c.name })}
            </Button>
          ))}
        </div>
      </section>
    );
  }
  return <Counter counter={mine} refresh={refresh} />;
}

function Counter({ counter, refresh }: { counter: CounterView; refresh: () => Promise<unknown> }) {
  const t = useTranslations("counter");
  const lanes = useTranslations("lanes");
  const locale = asLocale(useLocale());
  const { store } = useQueue();
  const calling = useRef(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const current = counter.current;
  // A pickup is served only after its release, or the document would wait with no number left to call (review 4).
  const awaitingRelease = current?.request?.status === "READY_FOR_PICKUP";

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    } finally {
      await refresh();
    }
  }

  async function callNext() {
    if (calling.current) return;
    calling.current = true;
    setEmpty(false);
    setError(null);
    try {
      const { ticket } = await api<{ ticket: TicketView | null }>(`/api/counters/${counter.id}/call-next`, { method: "POST" });
      setEmpty(ticket === null);
    } catch (err) {
      // A second press while the first call was on its way: the counter already has its ticket, show it.
      if (!(err instanceof ApiError && err.code === "counter_busy")) setError(err instanceof ApiError ? err.message : t("failed"));
    } finally {
      calling.current = false;
      await refresh();
    }
  }

  const waiting = store.snapshot?.waiting;
  return (
    <section className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">{counter.name}</h1>
        <Button
          variant="secondary"
          disabled={Boolean(current)}
          onClick={() => void run(() => api(`/api/counters/${counter.id}/${counter.open ? "close" : "open"}`, { method: "POST" }))}
        >
          {counter.open ? t("close") : t("open")}
        </Button>
      </div>
      {waiting && (
        <p className="text-muted">
          {t("waiting", { priority: waiting.PRIORITY, documents: waiting.DOCUMENTS, general: waiting.GENERAL })}
        </p>
      )}
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        {current ? (
          <>
            <Pill>{lanes(current.lane)}</Pill>
            <p className="font-heading text-7xl font-bold text-accent-ink">{current.code}</p>
            {current.request && (
              <p className="text-muted">
                {locale === "fil" ? current.request.documentType.nameFil : current.request.documentType.nameEn} ·{" "}
                {current.request.resident.fullName} · {current.request.feeCentavos === 0 ? t("free") : formatPeso(current.request.feeCentavos)}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="secondary"
                disabled={current.callCount >= 3}
                onClick={() => void run(() => api(`/api/queue/tickets/${current.id}/call-again`, { method: "POST" }))}
              >
                {current.callCount >= 3 ? t("calledThrice") : t("callAgain")}
              </Button>
              <Button disabled={awaitingRelease} onClick={() => void run(() => api(`/api/queue/tickets/${current.id}/served`, { method: "POST" }))}>
                {t("served")}
              </Button>
              <Button variant="ghost" onClick={() => void run(() => api(`/api/queue/tickets/${current.id}/missed`, { method: "POST" }))}>
                {t("missed")}
              </Button>
              {awaitingRelease && (
                <Button variant="secondary" onClick={() => setReleasing(true)}>
                  {t("release")}
                </Button>
              )}
            </div>
            {awaitingRelease && <p className="text-sm text-muted">{t("releaseFirst")}</p>}
            {releasing && current.request && <ReleaseDialog request={current.request} onDone={() => void refresh()} onClose={() => setReleasing(false)} />}
          </>
        ) : (
          <>
            <Button className="px-10 text-lg" onClick={() => void callNext()} disabled={!counter.open}>
              {t("callNext")}
            </Button>
            {empty && <p className="text-muted">{t("empty")}</p>}
          </>
        )}
        <LiveRegion className="text-danger">{error}</LiveRegion>
      </Card>
      <MissedList />
    </section>
  );
}

function MissedList() {
  const t = useTranslations("counter");
  const client = useQueryClient();
  const missed = useQuery({ queryKey: ["tickets", "missed"], queryFn: () => api<TicketView[]>("/api/queue/tickets?status=MISSED") });
  const list = (missed.data ?? []).filter((m) => !m.rejoined);
  if (list.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-bold">{t("missedTitle")}</h2>
      <ul className="flex flex-wrap gap-2">
        {list.map((m) => (
          <li key={m.id}>
            <Button
              variant="secondary"
              onClick={() =>
                void api(`/api/queue/tickets/${m.id}/rejoin`, { method: "POST" }).finally(() =>
                  client.invalidateQueries({ queryKey: ["tickets", "missed"] }),
                )
              }
            >
              {t("rejoin", { code: m.code })}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
