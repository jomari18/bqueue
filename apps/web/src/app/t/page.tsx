"use client";

import dynamic from "next/dynamic";

// The tracking token is in the link's fragment, which only the browser sees.
const TrackerScreen = dynamic(() => import("@/features/tracker/TrackerScreen").then((m) => m.TrackerScreen), { ssr: false });

export default function Page() {
  return <TrackerScreen />;
}
