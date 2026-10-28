import { Inject, Injectable } from "@nestjs/common";
import {
  addDays,
  DOCUMENT_CODES,
  LANES,
  manilaDate,
  manilaDayStart,
  manilaHour,
  REQUEST_STATUSES,
  type ReportSummary,
} from "@bq/shared";
import { CLOCK, type Clock } from "../common/clock.js";
import { PrismaService } from "../prisma/prisma.service.js";

const DAYS_BEFORE: Record<ReportSummary["range"], number> = { today: 0, "7d": 6, "30d": 29 };
const DAY_MS = 86_400_000;

const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x: number | null, digits: number) => (x === null ? null : Math.round(x * 10 ** digits) / 10 ** digits);
const seconds = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 1000;

/** The kapitan's summary (spec 9.6) over whole Manila days: today, the last 7 or the last 30. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly db: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async summary(barangayId: string, range: ReportSummary["range"]): Promise<ReportSummary> {
    const to = manilaDate(this.clock.now());
    const from = addDays(to, -DAYS_BEFORE[range]);
    const start = manilaDayStart(from);
    const end = new Date(manilaDayStart(to).getTime() + DAY_MS);

    const [created, released, tickets] = await Promise.all([
      this.db.request.findMany({
        where: { barangayId, createdAt: { gte: start, lt: end } },
        select: {
          status: true,
          createdAt: true,
          documentType: { select: { code: true } },
          events: { where: { toStatus: "READY_FOR_PICKUP" }, select: { createdAt: true }, take: 1 },
        },
      }),
      this.db.request.findMany({
        where: { barangayId, releasedAt: { gte: start, lt: end } },
        select: { feeCentavos: true, revokedAt: true },
      }),
      this.db.queueTicket.findMany({
        where: { barangayId, day: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) } },
        select: { lane: true, status: true, queuedAt: true, calledAt: true, servedAt: true },
      }),
    ]);

    const byTypeStatus: ReportSummary["requests"]["byTypeStatus"] = [];
    for (const code of DOCUMENT_CODES)
      for (const status of REQUEST_STATUSES) {
        const count = created.filter((r) => r.documentType.code === code && r.status === status).length;
        if (count > 0) byTypeStatus.push({ code, status, count });
      }
    const daysToReady = created.flatMap((r) => (r.events[0] ? [(r.events[0].createdAt.getTime() - r.createdAt.getTime()) / DAY_MS] : []));

    const lanes = LANES.map((lane) => {
      const inLane = tickets.filter((t) => t.lane === lane);
      const served = inLane.filter((t) => t.status === "SERVED");
      const missed = inLane.filter((t) => t.status === "MISSED").length;
      const finished = served.length + missed;
      return {
        lane,
        tickets: inLane.length,
        avgWaitSeconds: round(average(inLane.flatMap((t) => (t.calledAt ? [seconds(t.queuedAt, t.calledAt)] : []))), 0),
        avgServiceSeconds: round(average(served.flatMap((t) => (t.calledAt && t.servedAt ? [seconds(t.calledAt, t.servedAt)] : []))), 0),
        noShowRate: finished ? round(missed / finished, 2) : null,
      };
    });
    const byHour = Array.from({ length: 24 }, () => 0);
    for (const t of tickets) byHour[manilaHour(t.queuedAt)]! += 1;

    return {
      range,
      from,
      to,
      requests: {
        byTypeStatus,
        avgDaysToReady: round(average(daysToReady), 1),
        released: released.length,
        feesCollectedCentavos: released.filter((r) => !r.revokedAt).reduce((sum, r) => sum + r.feeCentavos, 0),
      },
      queue: { lanes, byHour },
    };
  }
}
