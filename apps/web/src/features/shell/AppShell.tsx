"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect } from "react";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { IconRail } from "@/components/IconRail";
import { LanguageToggle } from "@/components/LanguageToggle";
import { BrandMark } from "@/components/ui";
import { DemoEnded } from "@/features/demo/DemoEnded";
import { DemoPanel } from "@/features/demo/DemoPanel";
import { loadDemo } from "@/lib/auth/demo-store";
import { allowedPath, homeFor } from "@/lib/auth/roles";
import { useSession } from "@/lib/auth/session";
import { navFor } from "@/lib/nav";
import { RealtimeProvider, useQueue } from "@/lib/realtime/hooks";
import { useBootSession } from "./useBootSession";

/** The signed-in part of the app: boot, role gate, the icon rail and, for demo visitors, the demo panel. */
export function AppShell({ children, wakeIntervalMs }: { children: ReactNode; wakeIntervalMs?: number }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const pathname = usePathname();
  const { status, waking } = useBootSession({ wakeIntervalMs });
  const { session } = useSession();
  const role = session?.user.role;
  // Demo visitors keep their logins on the device (loadDemo returns null on the server).
  const hasDemo = session ? loadDemo() !== null : false;

  useEffect(() => {
    if (status === "signed-out") router.replace("/login");
    else if (role && !allowedPath(role, pathname)) router.replace(homeFor(role));
  }, [status, role, pathname, router]);

  if (status === "ended") return <DemoEnded />;
  if (!session || !role || !allowedPath(role, pathname)) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center text-muted" aria-live="polite">
        {waking ? t("waking") : status === "offline" ? t("offline") : t("loading")}
      </main>
    );
  }
  return (
    <div className="min-h-dvh pb-24 md:pr-24 md:pb-0">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <div>
            <p className="font-heading text-lg font-bold leading-tight">B.Queue</p>
            <p className="text-sm text-muted">{session.barangay.name}</p>
          </div>
        </div>
        <LanguageToggle />
      </header>
      <RealtimeProvider>
        <LiveBanner />
        {hasDemo && <DemoPanel />}
        <div className="mx-auto max-w-5xl px-4 pb-8">{children}</div>
      </RealtimeProvider>
      <IconRail items={navFor(role)} active={pathname} />
    </div>
  );
}

function LiveBanner() {
  return <ConnectionBanner status={useQueue().status} />;
}
