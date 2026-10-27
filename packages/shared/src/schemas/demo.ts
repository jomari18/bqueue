import { z } from "../zod.js";

export const JoinInput = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{22}$/) });
export type JoinInput = z.infer<typeof JoinInput>;

export const KeyInput = z.object({ key: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export type KeyInput = z.infer<typeof KeyInput>;

export const TrackerInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export type TrackerInput = z.infer<typeof TrackerInput>;
