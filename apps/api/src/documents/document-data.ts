import type { DocumentData } from "@bq/shared";
import type { AuthUser } from "../auth/subjects.js";
import { AppError } from "../common/app-error.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { EVENTS_INCLUDE, REQUEST_INCLUDE, toRequestView } from "./views.js";

/** Everything the A4 print view needs (spec 11.3); only for released documents. */
export async function documentData(db: PrismaService, barangayId: string, viewer: AuthUser, requestId: string): Promise<DocumentData> {
  const row = await db.request.findFirst({
    where: { id: requestId, barangayId },
    include: {
      ...REQUEST_INCLUDE,
      ...EVENTS_INCLUDE,
      resident: true,
      barangay: { select: { name: true, city: true } },
      approvedBy: { select: { displayName: true } },
    },
  });
  if (!row || (viewer.role === "RESIDENT" && row.resident.userId !== viewer.userId)) throw new AppError("not_found");
  if (row.status !== "RELEASED") throw new AppError("invalid_transition");
  const kapitan =
    row.approvedBy ?? (await db.user.findFirst({ where: { barangayId, role: "KAPITAN" }, select: { displayName: true } }));
  const r = row.resident;
  return {
    request: toRequestView(row, row.events),
    resident: {
      fullName: r.fullName,
      birthDate: r.birthDate.toISOString().slice(0, 10),
      sex: r.sex,
      civilStatus: r.civilStatus,
      purok: r.purok,
      addressLine: r.addressLine,
      residentSince: r.residentSince,
    },
    barangay: row.barangay,
    kapitan: { displayName: kapitan?.displayName ?? "" },
    approvedAt: row.approvedAt?.toISOString() ?? null,
    releasedAt: row.releasedAt?.toISOString() ?? null,
  };
}
