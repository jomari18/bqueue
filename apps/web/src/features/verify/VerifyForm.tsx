"use client";

import { formatVerificationCode, normalizeVerificationCode } from "@bq/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui";

/** Anyone can type the code printed under a document's QR (spec 3.6); common misreadings are fixed first. */
export function VerifyForm() {
  const t = useTranslations("verify");
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const code = normalizeVerificationCode(typed);
    if (!code) return setError(t("invalid"));
    setError(null);
    router.push(`/verify/${formatVerificationCode(code)}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t("label")}</span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCDE-FGHJK"
          aria-describedby="verify-error"
          className="min-h-12 rounded-input border border-line bg-raised px-3 font-mono text-lg tracking-widest uppercase"
        />
      </label>
      <p id="verify-error" aria-live="polite" className="text-sm text-danger empty:hidden">
        {error}
      </p>
      <Button type="submit">{t("submit")}</Button>
    </form>
  );
}
