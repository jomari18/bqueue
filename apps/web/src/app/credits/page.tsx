import type { Metadata } from "next";
import { CreditsContent } from "@/features/credits/CreditsContent";

export const metadata: Metadata = { title: "Credits · B.Queue" };

export default function Page() {
  return <CreditsContent />;
}
