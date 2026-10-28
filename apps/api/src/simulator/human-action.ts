import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { mergeMap, type Observable } from "rxjs";
import type { Subject } from "../auth/subjects.js";
import { ActivityBus } from "../common/activity.js";
import { CLOCK, type Clock } from "../common/clock.js";
import { PrismaService } from "../prisma/prisma.service.js";

const HUMAN_ACTION = "bq:human-action";

/**
 * Marks a controller whose writes are a person's business actions (spec 8.5). Socket tickets, refreshes, reads and
 * demo or admin calls are never marked, so a forgotten TV tab cannot keep the simulator running.
 */
export const HumanAction = () => SetMetadata(HUMAN_ACTION, true);

/** After a successful non-GET handler of a marked controller, records the time and wakes the simulator. */
@Injectable()
export class HumanActionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
    private readonly activity: ActivityBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const marked = this.reflector.get<boolean>(HUMAN_ACTION, ctx.getClass());
    const req = ctx.switchToHttp().getRequest<Request & { subject?: Subject }>();
    if (!marked || req.method === "GET") return next.handle();
    return next.handle().pipe(
      mergeMap(async (result) => {
        const barangayId = req.subject?.barangayId;
        if (barangayId) {
          await this.db.barangay.update({ where: { id: barangayId }, data: { lastHumanActionAt: this.clock.now() } });
          this.activity.humanAction(barangayId);
        }
        return result;
      }),
    );
  }
}
