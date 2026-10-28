"use client";

import { announcement, type QueueCalledEvent } from "@bq/shared";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { BrandMark } from "@/components/ui";
import { DemoEnded } from "@/features/demo/DemoEnded";
import type { RealtimeEvent } from "@/lib/realtime/connection";
import { useKeyQueue } from "@/lib/realtime/hooks";
import en from "../../../messages/en.json";
import fil from "../../../messages/fil.json";
import { type AnnouncerDeps, browserDeps, createAnnouncer } from "./announcer";
import { CallBanner } from "./CallBanner";
import { CounterCards } from "./CounterCards";
import { DisplayClock } from "./DisplayClock";
import { RecentCalls } from "./RecentCalls";
import { StartScreen } from "./StartScreen";
import { useIdlePause } from "./useIdlePause";
import { WaitingByLane } from "./WaitingByLane";

export type DisplayLang = "en" | "fil";
const LANG_KEY = "bq-display-lang";

function readLang(): DisplayLang {
  try {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "fil";
  } catch {
    return "fil";
  }
}

/** The Now Serving TV (spec 3.5, 10). It starts on a tap so the browser lets it play sound. */
export function DisplayScreen({ deps = browserDeps }: { deps?: AnnouncerDeps }) {
  const [lang, setLang] = useState<DisplayLang>(readLang);
  const [displayKey, setDisplayKey] = useState<string | null>(null);

  function choose(next: DisplayLang) {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // The choice still holds for this session.
    }
  }

  if (displayKey === null) return <StartScreen lang={lang} onLang={choose} onStart={() => setDisplayKey(location.hash.slice(1))} />;
  return (
    <NextIntlClientProvider locale={lang} messages={lang === "fil" ? fil : en} timeZone="Asia/Manila">
      {displayKey ? <LiveDisplay displayKey={displayKey} lang={lang} deps={deps} /> : <MissingKey />}
    </NextIntlClientProvider>
  );
}

function MissingKey() {
  const t = useTranslations("display");
  return <main className="grid min-h-dvh place-items-center p-8 text-center text-2xl">{t("missingKey")}</main>;
}

function LiveDisplay({ displayKey, lang, deps }: { displayKey: string; lang: DisplayLang; deps: AnnouncerDeps }) {
  const t = useTranslations("display");
  const announcer = useMemo(() => createAnnouncer(deps), [deps]);
  const [lastChange, setLastChange] = useState(() => Date.now());
  const [call, setCall] = useState<{ ev: QueueCalledEvent; pulse: boolean } | null>(null);

  const onEvent = (e: RealtimeEvent) => {
    if (e.type === "queue:changed" || e.type === "queue:called") setLastChange(Date.now());
    if (e.type === "queue:called") {
      announcer.announce(e.payload, lang);
      setCall({ ev: e.payload, pulse: true });
    }
  };
  const { store, status, close, reconnect } = useKeyQueue("display", displayKey, onEvent);
  const paused = useIdlePause(lastChange);

  useEffect(() => {
    if (paused) close();
  }, [paused, close]);
  useEffect(() => {
    if (!call?.pulse) return;
    const timer = setTimeout(() => setCall((c) => c && { ...c, pulse: false }), 5_000);
    return () => clearTimeout(timer);
  }, [call]);

  if (status === "ended") return <DemoEnded />;
  const snap = store.snapshot;
  const shown = call?.ev ?? (snap?.lastCalls[0] ? { ...snap.lastCalls[0], version: -1, callCount: 1 } : null);

  return (
    <main className="relative flex h-dvh flex-col gap-6 overflow-hidden bg-bg p-8 text-text">
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <BrandMark size={56} />
          <span className="font-heading text-4xl font-bold">{snap?.barangay.name}</span>
        </div>
        <DisplayClock lang={lang} />
      </header>
      <ConnectionBanner status={status} />
      <div className="grid min-h-0 flex-1 grid-cols-[3fr_2fr] gap-6">
        <CallBanner call={shown} pulse={call?.pulse ?? false} />
        <CounterCards counters={snap?.counters ?? []} />
      </div>
      <div className="grid grid-cols-[3fr_2fr] gap-6">
        <RecentCalls calls={snap?.lastCalls ?? []} />
        <WaitingByLane waiting={snap?.waiting ?? null} />
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {call ? announcement(call.ev.code, call.ev.counterName, lang) : ""}
      </div>
      {paused && (
        <button
          onClick={() => {
            setLastChange(Date.now());
            reconnect();
          }}
          className="absolute inset-0 grid place-items-center bg-bg/90 font-heading text-5xl font-bold"
        >
          {t("paused")}
        </button>
      )}
    </main>
  );
}
