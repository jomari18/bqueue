import { Inject, Injectable } from "@nestjs/common";
import { manilaDate, type QueueCalledEvent, type RequestSummary, type RequestUpdatedEvent, type RequestView } from "@bq/shared";
import { CLOCK, type Clock } from "../common/clock.js";
import { SocketHub } from "../common/socket-hub.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { queueSnapshot, ticketUpdates } from "../queue/read-model.js";

/** Server-to-client events (spec 8.2). Called after a write commits; clients never emit business events. */
@Injectable()
export class EventsService {
  constructor(
    private readonly hub: SocketHub,
    private readonly db: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  emitRequestCreated(barangayId: string, request: RequestSummary): void {
    this.hub.emit(`b:${barangayId}:staff`, "request:created", request);
  }

  emitRequestUpdated(barangayId: string, request: RequestView, requesterUserId: string | null): void {
    const payload: RequestUpdatedEvent = { requestId: request.id, status: request.status, updatedAt: request.updatedAt };
    this.hub.emit(`b:${barangayId}:staff`, "request:updated", payload);
    if (requesterUserId) this.hub.emit(`u:${requesterUserId}`, "request:updated", payload);
  }

  /**
   * The full snapshot to the public room. It carries the version it was read with, so a snapshot built after a later
   * change can never be labelled older than its data (spec 8.3).
   */
  async emitQueueChanged(barangayId: string): Promise<void> {
    const snapshot = await queueSnapshot(this.db, barangayId, manilaDate(this.clock.now()));
    this.hub.emit(`b:${barangayId}:public`, "queue:changed", snapshot);
  }

  emitQueueCalled(barangayId: string, event: QueueCalledEvent): void {
    this.hub.emit(`b:${barangayId}:public`, "queue:called", event);
  }

  /** Each ticket owner's new position, to `u:` (resident with a login) or `t:` (kiosk ticket tracker). */
  async emitTicketPositions(barangayId: string, alsoTicketIds: string[] = []): Promise<void> {
    const updates = await ticketUpdates(this.db, barangayId, manilaDate(this.clock.now()), alsoTicketIds);
    for (const { room, update } of updates) if (room) this.hub.emit(room, "ticket:updated", update);
  }

  /** After every committed queue write: the snapshot, then the call (same version), then the positions. */
  async queueChanged(barangayId: string, called?: QueueCalledEvent, alsoTicketIds: string[] = []): Promise<void> {
    await this.emitQueueChanged(barangayId);
    if (called) this.emitQueueCalled(barangayId, called);
    await this.emitTicketPositions(barangayId, alsoTicketIds);
  }
}
