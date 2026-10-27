import type { AuthUser } from "../auth/subjects.js";
import { AppError } from "../common/app-error.js";
import type { PrismaService } from "../prisma/prisma.service.js";

/** A resident acting: a signed-in person, or a seeded resident without a login moved by the simulator. */
export type ResidentActor = { residentId: string; userId: string | null };

export async function residentActorFor(db: PrismaService, barangayId: string, user: AuthUser): Promise<ResidentActor> {
  const resident = await db.resident.findFirst({ where: { userId: user.userId, barangayId }, select: { id: true } });
  if (!resident) throw new AppError("not_found");
  return { residentId: resident.id, userId: user.userId };
}
