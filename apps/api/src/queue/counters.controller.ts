import { HumanAction } from "../simulator/human-action.js";
import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { AssignInput, type CounterView, type TicketView } from "@bq/shared";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { RolesGuard } from "../auth/roles.guard.js";
import type { AuthUser } from "../auth/subjects.js";
import { UuidPipe, ZodPipe } from "../common/pipes.js";
import { CountersService } from "./counters.service.js";
import { QueueService } from "./queue.service.js";

@HumanAction()
@Controller("counters")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("STAFF", "KAPITAN")
export class CountersController {
  constructor(
    private readonly counters: CountersService,
    private readonly queue: QueueService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<CounterView[]> {
    return this.counters.list(user.barangayId);
  }

  @Post(":id/call-next")
  @HttpCode(200)
  async callNext(@CurrentUser() user: AuthUser, @Param("id", UuidPipe) id: string): Promise<{ ticket: TicketView | null }> {
    return { ticket: await this.queue.callNext(user.barangayId, user, id) };
  }

  @Post(":id/open")
  @HttpCode(200)
  open(@CurrentUser() user: AuthUser, @Param("id", UuidPipe) id: string): Promise<CounterView> {
    return this.counters.open(user.barangayId, user, id);
  }

  @Post(":id/close")
  @HttpCode(200)
  close(@CurrentUser() user: AuthUser, @Param("id", UuidPipe) id: string): Promise<CounterView> {
    return this.counters.close(user.barangayId, user, id);
  }

  @Post(":id/assign")
  @HttpCode(200)
  assign(
    @CurrentUser() user: AuthUser,
    @Param("id", UuidPipe) id: string,
    @Body(new ZodPipe(AssignInput)) input: AssignInput,
  ): Promise<CounterView> {
    return this.counters.assign(user.barangayId, user, id, input.staffId);
  }
}
