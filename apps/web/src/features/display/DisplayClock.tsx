"use client";

import { useEffect, useState } from "react";
import { formatManilaDate, formatManilaTime } from "@/lib/format";
import type { DisplayLang } from "./DisplayScreen";

/** Manila date and time, whatever time zone the TV's box is set to. */
export function DisplayClock({ lang }: { lang: DisplayLang }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const iso = new Date(now).toISOString();
  return (
    <div className="text-right">
      <p className="font-heading text-4xl font-bold">{formatManilaTime(iso, lang)}</p>
      <p className="text-xl text-muted">{formatManilaDate(iso, lang)}</p>
    </div>
  );
}
