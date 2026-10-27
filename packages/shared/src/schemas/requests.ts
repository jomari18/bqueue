import { REQUEST_STATUSES } from "../enums.js";
import { z } from "../zod.js";
import { normalizeText } from "./text.js";

const text = (min: number, max: number) => z.string().transform(normalizeText).pipe(z.string().min(min).max(max));

export const SubmitRequestInput = z.object({
  id: z.uuid(),
  documentTypeId: z.uuid(),
  purpose: text(3, 120),
  businessName: text(2, 80).optional(),
});
export type SubmitRequestInput = z.infer<typeof SubmitRequestInput>;

export const ReasonInput = z.object({ reason: text(3, 200) });
export type ReasonInput = z.infer<typeof ReasonInput>;

export const ReleaseInput = z.object({
  idChecked: z.literal(true),
  orNumber: z
    .string()
    .regex(/^OR-\d{4,10}$/i, "Use OR- followed by 4 to 10 digits.")
    .transform((s) => s.toUpperCase())
    .optional(),
});
export type ReleaseInput = z.infer<typeof ReleaseInput>;

export const RequestsQuery = z.object({ status: z.enum(REQUEST_STATUSES).optional() });
export type RequestsQuery = z.infer<typeof RequestsQuery>;
