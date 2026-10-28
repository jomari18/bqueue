"use client";

import dynamic from "next/dynamic";

// The kiosk key is in the link's fragment, which only the browser sees.
const KioskScreen = dynamic(() => import("@/features/kiosk/KioskScreen").then((m) => m.KioskScreen), { ssr: false });

export default function Page() {
  return <KioskScreen />;
}
