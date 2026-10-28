"use client";

import { useTranslations } from "next-intl";
import { Button, Card } from "@/components/ui";

/** The electronic signature is the kapitan's name and the time of approval, printed on the document (spec 3.4). */
export function ApproveDialog({ signer, busy, onConfirm, onClose }: { signer: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const t = useTranslations("approvals");
  return (
    <Card role="dialog" aria-label={t("dialogTitle")} className="flex flex-col gap-3 border border-line">
      <h3 className="font-heading font-bold">{t("dialogTitle")}</h3>
      <p className="font-serif text-lg">{t("signedBy", { name: signer })}</p>
      <p className="text-sm text-muted">{t("signNote")}</p>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={onConfirm}>
          {t("sign")}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
      </div>
    </Card>
  );
}
