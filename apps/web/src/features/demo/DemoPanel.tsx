"use client";

import type { BarangayView, JoinCodeResult, Role } from "@bq/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api/client";
import { type DemoDevice, loadDemo, updateDemoLinks } from "@/lib/auth/demo-store";
import { switchRole } from "@/lib/auth/roles";
import { getSession, setSession, useSession } from "@/lib/auth/session";

const ROLES: { role: Role; labelKey: "roleKapitan" | "roleStaff" | "roleResident" }[] = [
  { role: "KAPITAN", labelKey: "roleKapitan" },
  { role: "STAFF", labelKey: "roleStaff" },
  { role: "RESIDENT", labelKey: "roleResident" },
];

/** Spec 3.1: switch roles, open the TV and the kiosk, join from a phone, and see when the demo ends. */
export function DemoPanel() {
  const t = useTranslations("demo");
  const router = useRouter();
  const { session } = useSession();
  const [demo, setDemo] = useState<DemoDevice | null>(() => loadDemo());
  const [busy, setBusy] = useState(false);

  // An expired phone QR code is replaced as soon as the panel shows (the code lives 10 minutes).
  useEffect(() => {
    if (!demo || new Date(demo.joinExpiresAt) > new Date()) return;
    void newJoinCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the panel opens
  }, []);

  if (!demo || !session) return null;
  const hoursLeft = Math.max(0, Math.floor((new Date(demo.barangay.expiresAt).getTime() - Date.now()) / 3_600_000));
  const isKapitan = session.user.role === "KAPITAN";

  async function newJoinCode() {
    const fresh = await api<JoinCodeResult>("/api/demo/join-code", { method: "POST" });
    updateDemoLinks(fresh);
    setDemo(loadDemo());
  }

  async function become(role: Role) {
    setBusy(true);
    try {
      router.push(await switchRole(role));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSimulator() {
    const current = getSession();
    if (!current) return;
    const barangay = await api<BarangayView>("/api/settings/simulator", { method: "PATCH", json: { on: !current.barangay.simulatorOn } });
    setSession({ ...current, barangay });
  }

  return (
    <section aria-label={t("title")} className="mx-auto mb-4 max-w-5xl px-4">
      <Card className="flex flex-col gap-4 border border-accent-tint md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-3">
          <p className="font-heading font-bold">{t("title")}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("switchRole")}>
            {ROLES.map(({ role, labelKey }) => (
              <Button
                key={role}
                variant={session.user.role === role ? "primary" : "secondary"}
                aria-pressed={session.user.role === role}
                disabled={busy}
                onClick={() => void become(role)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => window.open(demo.displayLink, "_blank", "noopener")}>
              {t("openTv")}
            </Button>
            <Button variant="ghost" onClick={() => window.open(demo.kioskLink, "_blank", "noopener")}>
              {t("openKiosk")}
            </Button>
          </div>
          <label className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={session.barangay.simulatorOn}
              aria-label={t("simulator")}
              disabled={!isKapitan}
              onClick={() => void toggleSimulator()}
              className={`h-8 w-14 rounded-pill p-1 disabled:opacity-60 ${session.barangay.simulatorOn ? "bg-accent" : "bg-line"}`}
            >
              <span className={`block size-6 rounded-pill bg-surface transition-transform ${session.barangay.simulatorOn ? "translate-x-6" : ""}`} />
            </button>
            <span>{t("simulator")}</span>
          </label>
          {!isKapitan && <p className="text-sm text-muted">{t("simulatorHint")}</p>}
          <p className="text-sm text-muted">{t("expires", { hours: hoursLeft })}</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <QrCode value={demo.joinLink} size={140} label={t("qrLabel")} />
          <p className="max-w-40 text-center text-sm text-muted">{t("qrHelp")}</p>
          <Button variant="secondary" onClick={() => void newJoinCode()}>
            {t("newQr")}
          </Button>
        </div>
      </Card>
    </section>
  );
}
