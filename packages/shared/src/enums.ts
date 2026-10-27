// The three queue lanes, in the order the TV and kiosk show them (spec 6).
export const LANES = ["PRIORITY", "DOCUMENTS", "GENERAL"] as const;
export type Lane = (typeof LANES)[number];
