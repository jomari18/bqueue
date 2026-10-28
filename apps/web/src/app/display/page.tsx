"use client";

import dynamic from "next/dynamic";

// The TV reads its key from the link's fragment and its language from this device, so it renders only in the browser.
const DisplayScreen = dynamic(() => import("@/features/display/DisplayScreen").then((m) => m.DisplayScreen), { ssr: false });

export default function Page() {
  return <DisplayScreen />;
}
