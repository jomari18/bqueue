"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button, Card } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { homeFor } from "@/lib/auth/roles";
import { loginWith } from "@/lib/auth/session";

export function LoginForm() {
  const t = useTranslations("login");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const session = await loginWith(String(form.get("username")), String(form.get("secret")));
      router.replace(homeFor(session.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
        <label className="flex flex-col gap-1">
          <span>{t("username")}</span>
          <input name="username" autoComplete="username" required className="min-h-12 rounded-input border border-line bg-raised px-3" />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("secret")}</span>
          <input name="secret" type="password" autoComplete="current-password" required className="min-h-12 rounded-input border border-line bg-raised px-3" />
        </label>
        <p role="alert" className="min-h-6 text-danger">
          {error}
        </p>
        <Button type="submit" disabled={busy}>
          {t("submit")}
        </Button>
      </form>
    </Card>
  );
}
