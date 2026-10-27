import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import en from "../../messages/en.json";
import fil from "../../messages/fil.json";

/** Renders with next-intl messages, as the root layout provides them. */
export function renderWithIntl(ui: ReactElement, opts: { locale?: "en" | "fil" } & RenderOptions = {}) {
  const locale = opts.locale ?? "en";
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "fil" ? fil : en} timeZone="Asia/Manila">
      {ui}
    </NextIntlClientProvider>,
    opts,
  );
}
