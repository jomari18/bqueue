import { z } from "../zod.js";

export const LoginInput = z.object({
  username: z.string().trim().toLowerCase().min(3).max(40),
  secret: z.string().min(1).max(100),
});
export type LoginInput = z.infer<typeof LoginInput>;

/** Six digits that are not all the same and not a straight run up or down (spec 7.1). */
export const PinSchema = z
  .string()
  .regex(/^\d{6}$/, "A PIN has 6 digits.")
  .refine((pin) => {
    const d = [...pin].map(Number);
    const steps = d.slice(1).map((n, i) => n - d[i]!);
    return !steps.every((s) => s === 0) && !steps.every((s) => s === 1) && !steps.every((s) => s === -1);
  }, "Choose a PIN that is harder to guess.");

export const PasswordSchema = z.string().min(12).max(100);
