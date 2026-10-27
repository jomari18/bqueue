import { AppShell } from "@/features/shell/AppShell";

export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
