"use client";

import { type CounterView, type Lane, LANES } from "@bq/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";

/** Counters and the lanes each one calls from (spec 3.4). Lanes are always sent in the fixed lane order. */
export function Counters() {
  const t = useTranslations("settings");
  const client = useQueryClient();
  const counters = useQuery({ queryKey: ["settings", "counters"], queryFn: () => api<CounterView[]>("/api/settings/counters") });
  const [name, setName] = useState("");
  const [lanes, setLanes] = useState<Lane[]>([...LANES]);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    try {
      await api("/api/settings/counters", { method: "POST", json: { name: name.trim(), lanes } });
      setName("");
      await client.invalidateQueries({ queryKey: ["settings", "counters"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-bold">{t("countersTitle")}</h2>
      <ul className="flex flex-col gap-3">
        {(counters.data ?? []).map((c) => (
          <CounterRow key={c.id} counter={c} />
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
        <label className="flex flex-col gap-1">
          <span>{t("newCounter")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} className="min-h-12 rounded-input border border-line bg-raised px-3" />
        </label>
        <LanePicker value={lanes} onChange={setLanes} />
        <Button disabled={name.trim().length === 0 || lanes.length === 0} onClick={() => void add()}>
          {t("addCounter")}
        </Button>
        <p aria-live="polite" className="w-full text-sm text-danger empty:hidden">
          {error}
        </p>
      </div>
    </Card>
  );
}

function CounterRow({ counter }: { counter: CounterView }) {
  const t = useTranslations("settings");
  const client = useQueryClient();
  const [name, setName] = useState(counter.name);
  const [lanes, setLanes] = useState<Lane[]>(counter.lanes);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await api(`/api/settings/counters/${counter.id}`, { method: "PATCH", json: { name: name.trim(), lanes } });
      await client.invalidateQueries({ queryKey: ["settings", "counters"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    }
  }

  return (
    <li className="flex flex-wrap items-end gap-3">
      <input
        aria-label={t("counterName", { name: counter.name })}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={30}
        className="min-h-12 rounded-input border border-line bg-raised px-3"
      />
      <LanePicker value={lanes} onChange={setLanes} />
      <Button variant="secondary" disabled={name.trim().length === 0 || lanes.length === 0} onClick={() => void save()}>
        {t("save")}
      </Button>
      <p aria-live="polite" className="w-full text-sm text-danger empty:hidden">
        {error}
      </p>
    </li>
  );
}

function LanePicker({ value, onChange }: { value: Lane[]; onChange: (lanes: Lane[]) => void }) {
  const lanes = useTranslations("lanes");
  const toggle = (lane: Lane) => onChange(LANES.filter((l) => (l === lane ? !value.includes(l) : value.includes(l))));
  return (
    <fieldset className="flex flex-wrap gap-3">
      {LANES.map((l) => (
        <label key={l} className="flex min-h-12 items-center gap-2">
          <input type="checkbox" checked={value.includes(l)} onChange={() => toggle(l)} className="size-5" />
          <span>{lanes(l)}</span>
        </label>
      ))}
    </fieldset>
  );
}
