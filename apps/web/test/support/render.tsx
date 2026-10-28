import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import en from "../../messages/en.json";
import fil from "../../messages/fil.json";

/** Renders with next-intl messages and a fresh query cache, as the root layout provides them. */
export function renderWithIntl(ui: ReactElement, opts: { locale?: "en" | "fil"; client?: QueryClient } & RenderOptions = {}) {
  const locale = opts.locale ?? "en";
  const client = opts.client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={locale === "fil" ? fil : en} timeZone="Asia/Manila">
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
    opts,
  );
}
