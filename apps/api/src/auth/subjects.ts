import type { Role } from "@bq/shared";

/** A signed-in person, from the access token. `barangayId` scopes every query (spec 4.3). */
export type AuthUser = { kind: "user"; userId: string; barangayId: string; role: Role };

/** A TV display or kiosk that proved its key. */
export type KeySubject = { kind: "display" | "kiosk"; barangayId: string };

export type Subject = AuthUser | KeySubject;
