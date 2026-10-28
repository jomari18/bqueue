import { Injectable } from "@nestjs/common";
import type { CounterView } from "@bq/shared";
import type { AuthUser } from "../auth/subjects.js";
import { AppError } from "../common/app-error.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import { assertOperator, counterViews } from "./counter-views.js";
import { QUEUE_TX, QueueService } from "./queue.service.js";
import { bumpVersion } from "./sequence.js";

@Injectable()
export class CountersService {
  constructor(
    private readonly db: PrismaService,
    private readonly queue: QueueService,
  ) {}

  list(barangayId: string): Promise<CounterView[]> {
    return counterViews(this.db, barangayId);
  }

  async open(barangayId: string, actor: AuthUser, counterId: string): Promise<CounterView> {
    await this.db.$transaction(async (tx) => {
      const counter = await this.lock(tx, barangayId, counterId);
      assertOperator(counter, actor);
      await tx.counter.update({ where: { id: counterId }, data: { open: true } });
      await bumpVersion(tx, barangayId);
    }, QUEUE_TX);
    await this.queue.publish(barangayId);
    return this.one(barangayId, counterId);
  }

  /** A counter cannot close while it still has a called ticket (spec 9.4). */
  async close(barangayId: string, actor: AuthUser, counterId: string): Promise<CounterView> {
    await this.db.$transaction(async (tx) => {
      const counter = await this.lock(tx, barangayId, counterId);
      assertOperator(counter, actor);
      if (counter.currentTicketId) throw new AppError("counter_busy");
      await tx.counter.update({ where: { id: counterId }, data: { open: false } });
      await bumpVersion(tx, barangayId);
    }, QUEUE_TX);
    await this.queue.publish(barangayId);
    return this.one(barangayId, counterId);
  }

  /**
   * Staff take an unassigned counter (or keep their own) and leave any other; the kapitan assigns any active staff
   * member, or clears the counter when no `staffId` is given.
   */
  async assign(barangayId: string, actor: AuthUser, counterId: string, staffId?: string): Promise<CounterView> {
    await this.db.$transaction(async (tx) => {
      const counter = await this.lock(tx, barangayId, counterId);
      let assignee: string | null;
      if (actor.role === "STAFF") {
        if (counter.staffId && counter.staffId !== actor.userId) throw new AppError("forbidden");
        assignee = actor.userId;
      } else if (actor.role === "KAPITAN") {
        assignee = staffId ?? null;
        if (assignee) {
          const staff = await tx.user.findFirst({ where: { id: assignee, barangayId, role: "STAFF", active: true } });
          if (!staff) throw new AppError("not_found");
        }
      } else throw new AppError("forbidden");
      if (assignee) {
        await tx.counter.updateMany({ where: { barangayId, staffId: assignee, id: { not: counterId } }, data: { staffId: null } });
      }
      await tx.counter.update({ where: { id: counterId }, data: { staffId: assignee } });
    }, QUEUE_TX);
    return this.one(barangayId, counterId);
  }

  private async lock(tx: Tx, barangayId: string, counterId: string) {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Counter" WHERE id = ${counterId}::uuid AND "barangayId" = ${barangayId}::uuid FOR UPDATE`;
    if (!row) throw new AppError("not_found");
    return tx.counter.findUniqueOrThrow({ where: { id: counterId } });
  }

  private async one(barangayId: string, counterId: string): Promise<CounterView> {
    const [view] = await counterViews(this.db, barangayId, [counterId]);
    return view!;
  }
}
