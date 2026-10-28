import { LANES } from "../enums.js";
import { z } from "../zod.js";

export const TakeTicketInput = z.object({ id: z.uuid(), lane: z.enum(LANES), requestId: z.uuid().optional() });
export type TakeTicketInput = z.infer<typeof TakeTicketInput>;

export const KioskTicketInput = z.object({ id: z.uuid(), lane: z.enum(LANES) });
export type KioskTicketInput = z.infer<typeof KioskTicketInput>;

export const TicketsQuery = z.object({ status: z.enum(["WAITING", "MISSED"]) });
export type TicketsQuery = z.infer<typeof TicketsQuery>;

export const AssignInput = z.object({ staffId: z.uuid().optional() });
export type AssignInput = z.infer<typeof AssignInput>;
