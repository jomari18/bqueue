import { Injectable } from "@nestjs/common";
import type { RequestSummary, RequestUpdatedEvent, RequestView } from "@bq/shared";
import { SocketHub } from "../common/socket-hub.js";

/** Server-to-client events (spec 8.2). Called after a write commits; clients never emit business events. */
@Injectable()
export class EventsService {
  constructor(private readonly hub: SocketHub) {}

  emitRequestCreated(barangayId: string, request: RequestSummary): void {
    this.hub.emit(`b:${barangayId}:staff`, "request:created", request);
  }

  emitRequestUpdated(barangayId: string, request: RequestView, requesterUserId: string | null): void {
    const payload: RequestUpdatedEvent = { requestId: request.id, status: request.status, updatedAt: request.updatedAt };
    this.hub.emit(`b:${barangayId}:staff`, "request:updated", payload);
    if (requesterUserId) this.hub.emit(`u:${requesterUserId}`, "request:updated", payload);
  }
}
