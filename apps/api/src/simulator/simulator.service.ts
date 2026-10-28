import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { manilaDate } from "@bq/shared";
import { ActivityBus } from "../common/activity.js";
import { CLOCK, type Clock } from "../common/clock.js";
import { PresenceTracker } from "../common/presence.js";
import { CONFIG, type Config } from "../config/config.js";
import { BUSINESS_NAMES, PURPOSES, SURNAMES } from "../demo/seed-data.js";
import { RequestsService } from "../documents/requests.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { QueueService } from "../queue/queue.service.js";
import { pickResidentAction, residentDelayMs, shouldRun, staffDelayMs, staffOutcome } from "./policy.js";

type Loop = "resident" | "staff";
type Rng = () => number;
const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
const OPEN_REQUEST = ["SUBMITTED", "FOR_APPROVAL", "READY_FOR_PICKUP"] as const;

/**
 * Keeps a demo barangay alive (spec 8.5): seeded residents submit requests and take numbers, and Ate Liza serves at
 * Counter 1. It uses the same services as people, so it emits the same events and obeys the same rules.
 */
@Injectable()
export class SimulatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Simulator");
  private readonly timers = new Map<string, Partial<Record<Loop, NodeJS.Timeout>>>();
  private readonly unsubscribe: (() => void)[] = [];
  /** A wake already checking the policy; a second wake at the same moment waits for it instead of starting twice. */
  private readonly starting = new Map<string, Promise<void>>();

  constructor(
    private readonly db: PrismaService,
    private readonly queue: QueueService,
    private readonly requests: RequestsService,
    private readonly presence: PresenceTracker,
    private readonly activity: ActivityBus,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    const wake = (barangayId: string) => void this.wake(barangayId).catch(() => undefined);
    this.unsubscribe.push(this.activity.onHumanAction(wake), this.presence.onChange(wake));
  }

  onModuleDestroy(): void {
    for (const off of this.unsubscribe) off();
    this.stopAll();
  }

  isRunning(barangayId: string): boolean {
    return this.timers.has(barangayId);
  }

  /** Starts both loops when the policy allows it; does nothing if they already run. */
  wake(barangayId: string): Promise<void> {
    if (this.isRunning(barangayId)) return Promise.resolve();
    const pending = this.starting.get(barangayId);
    if (pending) return pending;
    const start = (async () => {
      try {
        if (this.isRunning(barangayId) || !(await this.allowed(barangayId))) return;
        this.timers.set(barangayId, {});
        this.schedule(barangayId, "resident");
        this.schedule(barangayId, "staff");
      } finally {
        this.starting.delete(barangayId);
      }
    })();
    this.starting.set(barangayId, start);
    return start;
  }

  stop(barangayId: string): void {
    const t = this.timers.get(barangayId);
    if (t?.resident) clearTimeout(t.resident);
    if (t?.staff) clearTimeout(t.staff);
    this.timers.delete(barangayId);
  }

  stopAll(): void {
    for (const id of [...this.timers.keys()]) this.stop(id);
  }

  /** One loop turn: re-check the policy, act, schedule the next turn. Public so tests can drive it. */
  async tick(barangayId: string, loop: Loop): Promise<void> {
    try {
      if (!(await this.allowed(barangayId))) return this.stop(barangayId);
      const did = loop === "resident" ? await this.residentStep(barangayId, Math.random) : await this.staffStep(barangayId, Math.random);
      this.logger.debug(`${barangayId} ${loop}: ${did}`);
    } catch (err) {
      this.logger.debug(`${loop} step failed: ${(err as Error).message}`);
    }
    if (this.isRunning(barangayId)) this.schedule(barangayId, loop);
  }

  /** A seeded resident without a login submits a request (55%) or takes a number (45%). */
  async residentStep(barangayId: string, rng: Rng): Promise<string> {
    const action = pickResidentAction(rng);
    const residents = await this.db.resident.findMany({ where: { barangayId, userId: null }, select: { id: true } });
    for (let attempt = 0; attempt < 5 && residents.length > 0; attempt++) {
      const residentId = pick(rng, residents).id;
      if (action.kind === "request") {
        const open = await this.db.request.count({ where: { residentId, status: { in: [...OPEN_REQUEST] } } });
        if (open >= 3) continue;
        const types = await this.db.documentType.findMany({ where: { barangayId, active: true } });
        if (types.length === 0) return "skipped";
        const type = pick(rng, types);
        await this.requests.submit(
          barangayId,
          { residentId, userId: null },
          {
            id: randomUUID(),
            documentTypeId: type.id,
            purpose: pick(rng, PURPOSES),
            ...(type.needsBusinessName ? { businessName: `${pick(rng, BUSINESS_NAMES)} ni ${pick(rng, SURNAMES)}` } : {}),
          },
        );
        return `request ${type.code}`;
      }
      const active = await this.db.queueTicket.count({
        where: { residentId, lane: action.lane, status: { in: ["WAITING", "CALLED"] } },
      });
      if (active > 0) continue;
      const { ticket } = await this.queue.takeTicket(barangayId, { kind: "resident", residentId, userId: null }, { id: randomUUID(), lane: action.lane });
      return `ticket ${ticket.code}`;
    }
    return "skipped";
  }

  /** Ate Liza at Counter 1 finishes her current ticket (served 90%, missed 10%) and calls the next one that is not a pickup. */
  async staffStep(barangayId: string, rng: Rng): Promise<string> {
    const counter = await this.db.counter.findFirst({ where: { barangayId }, orderBy: [{ sortOrder: "asc" }] });
    if (!counter || !counter.open || !counter.staffId) return "skipped";
    const staff = { kind: "user" as const, userId: counter.staffId, barangayId, role: "STAFF" as const };
    if (counter.currentTicketId) await this.queue.finish(barangayId, staff, counter.currentTicketId, staffOutcome(rng));
    // Pickup numbers wait for a person at a counter, who checks the ID and releases the document.
    const next = await this.queue.callNext(barangayId, staff, counter.id, { skipPickups: true });
    return next ? `called ${next.code}` : "nobody waiting";
  }

  private schedule(barangayId: string, loop: Loop): void {
    const timers = this.timers.get(barangayId);
    if (!timers) return;
    const delay = loop === "resident" ? residentDelayMs(Math.random) : staffDelayMs(Math.random);
    timers[loop] = setTimeout(() => void this.tick(barangayId, loop), delay).unref();
  }

  private async allowed(barangayId: string): Promise<boolean> {
    const now = this.clock.now();
    const barangay = await this.db.barangay.findUnique({ where: { id: barangayId } });
    if (!barangay || barangay.expiresAt <= now) return false;
    const [requests, ticketsToday] = await Promise.all([
      this.db.request.count({ where: { barangayId } }),
      this.db.queueTicket.count({ where: { barangayId, day: new Date(`${manilaDate(now)}T00:00:00.000Z`) } }),
    ]);
    return shouldRun({
      enabled: this.config.SIMULATOR_ENABLED,
      simulatorOn: barangay.simulatorOn,
      sockets: this.presence.count(barangayId),
      lastSocketLeftAt: this.presence.lastLeftAt(barangayId),
      lastHumanActionAt: barangay.lastHumanActionAt,
      capsReached: requests >= 300 || ticketsToday >= 500,
      now,
    });
  }
}
