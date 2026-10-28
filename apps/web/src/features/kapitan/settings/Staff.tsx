"use client";

import { PinSchema, type StaffView } from "@bq/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card, Pill } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";

/** The PIN rule's own words in the current language: 6 digits, not all the same, not a run. */
function usePinCheck() {
  const t = useTranslations("settings");
  return (pin: string): string | null => {
    if (!/^\d{6}$/.test(pin)) return t("pinDigits");
    return PinSchema.safeParse(pin).success ? null : t("pinWeak");
  };
}

/** Staff accounts (spec 3.4): add with a PIN, reset a forgotten PIN, deactivate after confirming. */
export function Staff() {
  const t = useTranslations("settings");
  const client = useQueryClient();
  const check = usePinCheck();
  const staff = useQuery({ queryKey: ["settings", "staff"], queryFn: () => api<StaffView[]>("/api/settings/staff") });
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const problem = check(pin);
    if (problem) return setError(problem);
    setError(null);
    try {
      await api("/api/settings/staff", { method: "POST", json: { displayName: name.trim(), pin } });
      setName("");
      setPin("");
      await client.invalidateQueries({ queryKey: ["settings", "staff"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-bold">{t("staffTitle")}</h2>
      <ul className="flex flex-col gap-3">
        {(staff.data ?? []).map((s) => (
          <StaffRow key={s.id} person={s} />
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
        <label className="flex flex-col gap-1">
          <span>{t("staffName")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="min-h-12 rounded-input border border-line bg-raised px-3" />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("pin")}</span>
          <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} className="min-h-12 w-32 rounded-input border border-line bg-raised px-3" />
        </label>
        <Button disabled={name.trim().length < 2} onClick={() => void add()}>
          {t("addStaff")}
        </Button>
        <p className="w-full text-sm text-muted">{t("pinHint")}</p>
        <p aria-live="polite" className="w-full text-sm text-danger empty:hidden">
          {error}
        </p>
      </div>
    </Card>
  );
}

function StaffRow({ person }: { person: StaffView }) {
  const t = useTranslations("settings");
  const client = useQueryClient();
  const check = usePinCheck();
  const [mode, setMode] = useState<"idle" | "pin" | "deactivate">("idle");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function patch(body: { pin?: string; active?: boolean }) {
    setError(null);
    try {
      await api(`/api/settings/staff/${person.id}`, { method: "PATCH", json: body });
      setMode("idle");
      setPin("");
      await client.invalidateQueries({ queryKey: ["settings", "staff"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    }
  }

  function savePin() {
    const problem = check(pin);
    if (problem) return setError(problem);
    void patch({ pin });
  }

  return (
    <li className="flex flex-wrap items-center gap-3">
      <div className="min-w-40 flex-1">
        <p className="font-medium">{person.displayName}</p>
        <p className="text-sm text-muted">
          {person.username}
          {person.counterName ? ` · ${person.counterName}` : ""}
        </p>
      </div>
      {!person.active && <Pill tone="muted">{t("inactive")}</Pill>}
      {mode === "pin" && (
        <div className="flex w-full flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span>{t("newPin")}</span>
            <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} className="min-h-12 w-32 rounded-input border border-line bg-raised px-3" />
          </label>
          <Button onClick={savePin}>{t("savePin")}</Button>
          <Button variant="secondary" onClick={() => setMode("idle")}>
            {t("cancel")}
          </Button>
          <p className="w-full text-sm text-muted">{t("pinHint")}</p>
        </div>
      )}
      {mode === "deactivate" && (
        <div className="flex w-full flex-wrap gap-2">
          <Button variant="danger" onClick={() => void patch({ active: false })}>
            {t("confirmDeactivate", { name: person.displayName })}
          </Button>
          <Button variant="secondary" onClick={() => setMode("idle")}>
            {t("cancel")}
          </Button>
        </div>
      )}
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setMode("pin")}>
            {t("resetPin")}
          </Button>
          {person.active ? (
            <Button variant="ghost" onClick={() => setMode("deactivate")}>
              {t("deactivate")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => void patch({ active: true })}>
              {t("activate")}
            </Button>
          )}
        </div>
      )}
      <p aria-live="polite" className="w-full text-sm text-danger empty:hidden">
        {error}
      </p>
    </li>
  );
}
