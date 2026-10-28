"use client";

import type { KeyRotationResult } from "@bq/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";
import { updateDemoLinks } from "@/lib/auth/demo-store";

type Kind = "display" | "kiosk";

/** New TV and kiosk links (spec 3.4): the old key stops at once, and the new link is shown only this one time. */
export function Keys() {
  const t = useTranslations("settings");
  const [pending, setPending] = useState<Kind | null>(null);
  const [made, setMade] = useState<{ kind: Kind; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rotate(kind: Kind) {
    setBusy(true);
    setError(null);
    try {
      const { link } = await api<KeyRotationResult>(`/api/settings/keys/${kind}/rotate`, { method: "POST" });
      updateDemoLinks(kind === "display" ? { displayLink: link } : { kioskLink: link });
      setMade({ kind, link });
      setPending(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-bold">{t("keysTitle")}</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setPending("display")}>
          {t("rotateDisplay")}
        </Button>
        <Button variant="secondary" onClick={() => setPending("kiosk")}>
          {t("rotateKiosk")}
        </Button>
      </div>
      {pending && (
        <div className="flex flex-col gap-2 rounded-input border border-line p-3">
          <p>{t("rotateWarning")}</p>
          <div className="flex gap-2">
            <Button variant="danger" disabled={busy} onClick={() => void rotate(pending)}>
              {t("rotateConfirm")}
            </Button>
            <Button variant="secondary" onClick={() => setPending(null)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
      {made && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">{t(made.kind === "display" ? "newDisplayLink" : "newKioskLink")}</p>
          <code className="break-all rounded-input bg-raised p-2">{made.link}</code>
        </div>
      )}
      <p aria-live="polite" className="text-sm text-danger empty:hidden">
        {error}
      </p>
    </Card>
  );
}
