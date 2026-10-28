import type { Role } from "@bq/shared";
import { loadDemo } from "./demo-store";
import { loginWith, logout } from "./session";

export function homeFor(role: Role): string {
  return role === "KAPITAN" ? "/kapitan" : role === "STAFF" ? "/staff/counter" : "/r";
}

/** Whether a path belongs to a role's part of the app. */
export function allowedPath(role: Role, path: string): boolean {
  if (path.startsWith("/r")) return role === "RESIDENT";
  if (path.startsWith("/staff")) return role === "STAFF" || role === "KAPITAN";
  if (path.startsWith("/kapitan")) return role === "KAPITAN";
  return true;
}

/** Demo role switcher: signs out, then in with the stored demo login of the other role. */
export async function switchRole(role: Role): Promise<string> {
  const demo = loadDemo();
  if (!demo) throw new Error("No demo logins on this device.");
  const { kapitan, staff, resident } = demo.logins;
  const [username, secret] =
    role === "KAPITAN" ? [kapitan.username, kapitan.password] : role === "STAFF" ? [staff.username, staff.pin] : [resident.username, resident.password];
  await logout();
  await loginWith(username, secret);
  return homeFor(role);
}
