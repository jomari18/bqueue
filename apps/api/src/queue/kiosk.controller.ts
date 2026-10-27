import { Body, Controller, Post, Res, UseGuards } from "@nestjs/common";
import { KioskTicketInput, type KioskTicketResult } from "@bq/shared";
import type { Response } from "express";
import { CurrentSubject } from "../auth/decorators.js";
import { KeyGuard, KeyKinds } from "../auth/key.guard.js";
import type { Subject } from "../auth/subjects.js";
import { ZodPipe } from "../common/pipes.js";
import { QueueService } from "./queue.service.js";

/** Walk-in numbers from the hall's tablet (spec 3.5); rate-limited per kiosk key in configure-app. */
@Controller("kiosk")
@UseGuards(KeyGuard)
@KeyKinds("kiosk")
export class KioskController {
  constructor(private readonly queue: QueueService) {}

  @Post("tickets")
  async take(
    @CurrentSubject() subject: Subject,
    @Body(new ZodPipe(KioskTicketInput)) input: KioskTicketInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<KioskTicketResult> {
    const result = await this.queue.takeTicket(subject.barangayId, { kind: "kiosk" }, input);
    res.status(result.duplicate ? 200 : 201);
    return { ticket: result.ticket, trackingToken: result.trackingToken!, duplicate: result.duplicate };
  }
}
