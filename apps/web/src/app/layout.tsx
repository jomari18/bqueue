import type { Metadata, Viewport } from "next";
import { Inter, Noto_Serif, Sora } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "./providers";
import "./globals.css";

// The Donka file's families, all under the SIL Open Font License; next/font serves them from this site.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["600", "700"], display: "swap" });
const notoSerif = Noto_Serif({ variable: "--font-noto-serif", subsets: ["latin"], weight: ["500", "600"], display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "B.Queue · Barangay requests and queue",
  description: "Request barangay documents online, follow them live, and wait for your number from your phone.",
  openGraph: {
    type: "website",
    siteName: "B.Queue",
    title: "B.Queue · Barangay requests and queue",
    description: "Barangay requests and a live queue, in one place.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "B.Queue: barangay requests and a live queue" }],
  },
  twitter: { card: "summary_large_image", title: "B.Queue · Barangay requests and queue", images: ["/og.png"] },
};

export const viewport: Viewport = { themeColor: "#F8F7F4" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale === "fil" ? "fil" : "en"} className={`${inter.variable} ${sora.variable} ${notoSerif.variable}`}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Manila">
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
