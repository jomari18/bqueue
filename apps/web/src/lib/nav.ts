import type { Role } from "@bq/shared";
import { ClipboardCheck, FileText, Home, LayoutList, type LucideIcon, MonitorSpeaker, PieChart, Settings, Ticket } from "lucide-react";

export type RailItem = { href: string; labelKey: string; icon: LucideIcon };

const HOME: RailItem = { href: "/r", labelKey: "home", icon: Home };
const MY_REQUESTS: RailItem = { href: "/r/requests", labelKey: "myRequests", icon: FileText };
const MY_TICKET: RailItem = { href: "/r/ticket", labelKey: "myTicket", icon: Ticket };
const BOARD: RailItem = { href: "/staff", labelKey: "board", icon: LayoutList };
const COUNTER: RailItem = { href: "/staff/counter", labelKey: "counter", icon: MonitorSpeaker };
const APPROVALS: RailItem = { href: "/kapitan", labelKey: "approvals", icon: ClipboardCheck };
const REPORTS: RailItem = { href: "/kapitan/reports", labelKey: "reports", icon: PieChart };
const SETTINGS: RailItem = { href: "/kapitan/settings", labelKey: "settings", icon: Settings };

/** The places each role may go; the kapitan can also work the board and a counter (spec 7.4). */
export function navFor(role: Role): RailItem[] {
  switch (role) {
    case "RESIDENT":
      return [HOME, MY_REQUESTS, MY_TICKET];
    case "STAFF":
      return [BOARD, COUNTER];
    case "KAPITAN":
      return [APPROVALS, BOARD, COUNTER, REPORTS, SETTINGS];
  }
}
