import type { DocumentTypeView, RequestSummary, RequestView } from "@bq/shared";
import type { Prisma } from "../generated/prisma/client.js";

export const REQUEST_INCLUDE = {
  documentType: { select: { code: true, nameEn: true, nameFil: true } },
  resident: { select: { id: true, fullName: true, userId: true } },
} as const;

export const EVENTS_INCLUDE = {
  events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { displayName: true } } } },
} as const;

export type RequestRow = Prisma.RequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;
type EventRow = Prisma.RequestEventGetPayload<{ include: { actor: { select: { displayName: true } } } }>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toRequestSummary(r: RequestRow): RequestSummary {
  return {
    id: r.id,
    status: r.status,
    documentType: r.documentType,
    purpose: r.purpose,
    businessName: r.businessName,
    feeCentavos: r.feeCentavos,
    rejectReason: r.rejectReason,
    orNumber: r.orNumber,
    verificationCode: r.verificationCode,
    validUntil: iso(r.validUntil),
    revokedAt: iso(r.revokedAt),
    revokeReason: r.revokeReason,
    resident: { id: r.resident.id, fullName: r.resident.fullName },
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toRequestView(r: RequestRow, events?: EventRow[]): RequestView {
  const view: RequestView = toRequestSummary(r);
  if (events) {
    view.events = events.map((e) => ({
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorName: e.actor?.displayName ?? null,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    }));
  }
  return view;
}

export function toDocumentTypeView(t: Prisma.DocumentTypeGetPayload<object>): DocumentTypeView {
  return {
    id: t.id,
    code: t.code,
    nameEn: t.nameEn,
    nameFil: t.nameFil,
    feeCentavos: t.feeCentavos,
    processingDays: t.processingDays,
    validityDays: t.validityDays,
    needsBusinessName: t.needsBusinessName,
    active: t.active,
  };
}
