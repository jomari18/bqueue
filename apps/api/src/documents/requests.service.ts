import { Inject, Injectable } from "@nestjs/common";
import {
  nextStatus,
  type RequestAction,
  type RequestStatus,
  type RequestsQuery,
  type RequestSummary,
  type RequestView,
  type Role,
  type SubmitRequestInput,
} from "@bq/shared";
import type { AuthUser } from "../auth/subjects.js";
import { AppError } from "../common/app-error.js";
import { CLOCK, type Clock } from "../common/clock.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import { EventsService } from "../realtime/events.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { CODE_GENERATOR, type CodeGenerator } from "./verification.js";
import type { ResidentActor } from "./resident-actor.js";
import { EVENTS_INCLUDE, REQUEST_INCLUDE, toRequestSummary, toRequestView } from "./views.js";

export type RequestActionInput =
  | { action: "cancel" }
  | { action: "forward" }
  | { action: "reject"; reason: string }
  | { action: "approve" }
  | { action: "release"; idChecked: true; orNumber?: string }
  | { action: "revoke"; reason: string };

const OPEN: RequestStatus[] = ["SUBMITTED", "FOR_APPROVAL", "READY_FOR_PICKUP"];
const MAX_OPEN_PER_RESIDENT = 3;
const MAX_PER_BARANGAY = 300;

/**
 * One action inside the transaction, after the status and role checks. It returns the fields to set together with
 * the new status (a verification code must arrive with RELEASED, spec 5) and the event's note.
 */
export type ApplyAction = (
  tx: Tx,
  request: { id: string; feeCentavos: number; documentTypeId: string; revokedAt: Date | null },
  input: RequestActionInput,
  actor: AuthUser,
  now: Date,
) => Promise<{ data?: Prisma.RequestUncheckedUpdateInput; note?: string | null }>;

const DAY_MS = 86_400_000;
const CODE_ATTEMPTS = 3;

@Injectable()
export class RequestsService {
  private readonly actions: Record<RequestAction, ApplyAction> = {
    cancel: async () => ({}),
    forward: async () => ({}),
    reject: async (_tx, _r, input) => {
      const reason = (input as { reason: string }).reason;
      return { data: { rejectReason: reason }, note: reason };
    },
    approve: async (_tx, _r, _input, actor, now) => ({ data: { approvedById: actor.userId, approvedAt: now } }),
    release: async (tx, r, input, actor, now) => {
      const { orNumber } = input as { orNumber?: string };
      if (r.feeCentavos > 0 && !orNumber) throw new AppError("invalid_input", { field: "orNumber" });
      const type = await tx.documentType.findUniqueOrThrow({ where: { id: r.documentTypeId } });
      return {
        data: {
          releasedById: actor.userId,
          releasedAt: now,
          orNumber: r.feeCentavos > 0 ? orNumber : null,
          verificationCode: await this.freshCode(tx),
          validUntil: new Date(now.getTime() + type.validityDays * DAY_MS),
        },
      };
    },
    revoke: async (_tx, r, input, _actor, now) => {
      if (r.revokedAt) throw new AppError("invalid_transition");
      const reason = (input as { reason: string }).reason;
      return { data: { revokedAt: now, revokeReason: reason }, note: reason };
    },
  };

  constructor(
    private readonly db: PrismaService,
    private readonly events: EventsService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CODE_GENERATOR) private readonly codes: CodeGenerator,
  ) {}

  /** A code no other document has; a clash is retried up to 3 times. */
  private async freshCode(tx: Tx): Promise<string> {
    for (let i = 0; i < CODE_ATTEMPTS; i++) {
      const code = this.codes.next();
      if (!(await tx.request.findUnique({ where: { verificationCode: code }, select: { id: true } }))) return code;
    }
    throw new AppError("service_unavailable");
  }

  /** Idempotent by the client's id (spec 6.11); the fee is copied from the type at submit time. */
  async submit(
    barangayId: string,
    actor: ResidentActor,
    input: SubmitRequestInput,
  ): Promise<{ request: RequestView; duplicate: boolean }> {
    const existing = await this.db.request.findUnique({ where: { id: input.id }, include: { ...REQUEST_INCLUDE, ...EVENTS_INCLUDE } });
    if (existing) {
      if (existing.barangayId !== barangayId || existing.residentId !== actor.residentId) {
        throw new AppError("invalid_input", { field: "id" });
      }
      return { request: toRequestView(existing, existing.events), duplicate: true };
    }
    const type = await this.db.documentType.findFirst({ where: { id: input.documentTypeId, barangayId, active: true } });
    if (!type) throw new AppError("invalid_input", { field: "documentTypeId" });
    if (type.needsBusinessName && !input.businessName) throw new AppError("invalid_input", { field: "businessName" });

    const now = this.clock.now();
    const created = await this.db.$transaction(async (tx) => {
      const open = await tx.request.count({ where: { residentId: actor.residentId, status: { in: OPEN } } });
      if (open >= MAX_OPEN_PER_RESIDENT) throw new AppError("limit_reached");
      if ((await tx.request.count({ where: { barangayId } })) >= MAX_PER_BARANGAY) throw new AppError("limit_reached");
      await tx.request.create({
        data: {
          id: input.id,
          barangayId,
          residentId: actor.residentId,
          documentTypeId: type.id,
          purpose: input.purpose,
          businessName: type.needsBusinessName ? (input.businessName ?? null) : null,
          status: "SUBMITTED",
          feeCentavos: type.feeCentavos,
          createdAt: now,
          updatedAt: now,
        },
      });
      await tx.requestEvent.create({
        data: { requestId: input.id, fromStatus: null, toStatus: "SUBMITTED", actorId: actor.userId, createdAt: now },
      });
      return tx.request.findUniqueOrThrow({ where: { id: input.id }, include: { ...REQUEST_INCLUDE, ...EVENTS_INCLUDE } });
    });
    this.events.emitRequestCreated(barangayId, toRequestSummary(created));
    return { request: toRequestView(created, created.events), duplicate: false };
  }

  /** Residents see their own, newest first; staff and the kapitan see the board, oldest first. */
  async list(barangayId: string, viewer: AuthUser, query: RequestsQuery): Promise<RequestSummary[]> {
    const resident = viewer.role === "RESIDENT";
    const rows = await this.db.request.findMany({
      where: {
        barangayId,
        ...(resident ? { resident: { userId: viewer.userId } } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: resident ? "desc" : "asc" },
      take: 200,
    });
    return rows.map(toRequestSummary);
  }

  async get(barangayId: string, viewer: AuthUser, id: string): Promise<RequestView> {
    const row = await this.db.request.findFirst({ where: { id, barangayId }, include: { ...REQUEST_INCLUDE, ...EVENTS_INCLUDE } });
    if (!row || (viewer.role === "RESIDENT" && row.resident.userId !== viewer.userId)) throw new AppError("not_found");
    return toRequestView(row, row.events);
  }

  /**
   * Spec 6.1: locks the request, checks the move with the shared table (403 forbidden, 409 invalid_transition),
   * applies it and writes its RequestEvent in one transaction, then emits.
   */
  async transition(barangayId: string, actor: AuthUser, requestId: string, input: RequestActionInput): Promise<RequestView> {
    const now = this.clock.now();
    const updated = await this.db.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Request" WHERE id = ${requestId}::uuid AND "barangayId" = ${barangayId}::uuid FOR UPDATE`;
      if (!locked) throw new AppError("not_found");
      const row = await tx.request.findUniqueOrThrow({ where: { id: requestId }, include: REQUEST_INCLUDE });
      if (actor.role === "RESIDENT" && row.resident.userId !== actor.userId) throw new AppError("not_found");
      const role: Role = actor.role;
      const move = nextStatus(row.status, input.action, role);
      if (!move.ok) throw new AppError(move.reason);
      const { data, note = null } = await this.actions[input.action](tx, row, input, actor, now);
      await tx.request.update({ where: { id: requestId }, data: { ...data, status: move.to, updatedAt: now } });
      await tx.requestEvent.create({
        data: { requestId, fromStatus: row.status, toStatus: move.to, actorId: actor.userId, note, createdAt: now },
      });
      return tx.request.findUniqueOrThrow({ where: { id: requestId }, include: { ...REQUEST_INCLUDE, ...EVENTS_INCLUDE } });
    });
    const view = toRequestView(updated, updated.events);
    this.events.emitRequestUpdated(barangayId, view, updated.resident.userId);
    return view;
  }
}
