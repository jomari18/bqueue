import type { Lane } from "./enums.js";

export const LANE_LETTER: Record<Lane, "P" | "D" | "G"> = { PRIORITY: "P", DOCUMENTS: "D", GENERAL: "G" };
const LANE_BY_LETTER: Record<string, Lane> = { P: "PRIORITY", D: "DOCUMENTS", G: "GENERAL" };

/** "D-012": the lane letter and at least three digits; after 999 the number keeps its digits (spec 6.4). */
export function ticketCode(lane: Lane, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("Ticket numbers start at 1.");
  return `${LANE_LETTER[lane]}-${String(n).padStart(3, "0")}`;
}

export function parseTicketCode(code: string): { lane: Lane; number: number } | null {
  const match = /^([PDG])-(\d{3,})$/.exec(code);
  if (!match) return null;
  const n = Number(match[2]);
  if (n < 1 || ticketCode(LANE_BY_LETTER[match[1]!]!, n) !== code) return null;
  return { lane: LANE_BY_LETTER[match[1]!]!, number: n };
}
