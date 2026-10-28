import { LANES } from "../enums.js";
import { z } from "../zod.js";
import { PinSchema } from "./auth.js";
import { normalizeText } from "./text.js";

const atLeastOne = (o: object) => Object.values(o).some((v) => v !== undefined);
const name = (min: number, max: number) => z.string().transform(normalizeText).pipe(z.string().min(min).max(max));
const lanes = z
  .array(z.enum(LANES))
  .min(1)
  .refine((l) => new Set(l).size === l.length, "Each lane once.");

export const DocumentTypePatch = z
  .object({ feeCentavos: z.int().min(0).max(1_000_000).optional(), active: z.boolean().optional() })
  .refine(atLeastOne, "Change at least one field.");
export type DocumentTypePatch = z.infer<typeof DocumentTypePatch>;

export const CounterInput = z.object({ name: name(1, 30), lanes });
export type CounterInput = z.infer<typeof CounterInput>;

export const CounterPatch = z
  .object({ name: name(1, 30).optional(), lanes: lanes.optional(), sortOrder: z.int().min(0).max(99).optional() })
  .refine(atLeastOne, "Change at least one field.");
export type CounterPatch = z.infer<typeof CounterPatch>;

export const StaffInput = z.object({ displayName: name(2, 40), pin: PinSchema });
export type StaffInput = z.infer<typeof StaffInput>;

export const StaffPatch = z
  .object({ pin: PinSchema.optional(), active: z.boolean().optional() })
  .refine(atLeastOne, "Change at least one field.");
export type StaffPatch = z.infer<typeof StaffPatch>;

export const SimulatorInput = z.object({ on: z.boolean() });
export type SimulatorInput = z.infer<typeof SimulatorInput>;

export const ReportsQuery = z.object({ range: z.enum(["today", "7d", "30d"]).default("today") });
export type ReportsQuery = z.infer<typeof ReportsQuery>;
