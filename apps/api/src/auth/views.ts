import type { BarangayView, UserView } from "@bq/shared";
import type { Barangay, User } from "../generated/prisma/client.js";

export function toUserView(u: User): UserView {
  return { id: u.id, role: u.role, username: u.username, displayName: u.displayName };
}

export function toBarangayView(b: Barangay): BarangayView {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    city: b.city,
    expiresAt: b.expiresAt.toISOString(),
    simulatorOn: b.simulatorOn,
  };
}
