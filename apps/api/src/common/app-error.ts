import type { Bilingual, ErrorCode } from "@bq/shared";

/** An error the API answers with on purpose, in the spec 9.9 format. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly bilingual?: Bilingual;
  readonly field?: string;
  readonly retryAfter?: Date;
  /** Spread at the top level of the body, next to `error` (only `already_in_queue` uses it). */
  readonly extra?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    opts: { message?: Bilingual; field?: string; retryAfter?: Date; extra?: Record<string, unknown> } = {},
  ) {
    super(opts.message?.en ?? code);
    this.name = "AppError";
    this.code = code;
    this.bilingual = opts.message;
    this.field = opts.field;
    this.retryAfter = opts.retryAfter;
    this.extra = opts.extra;
  }
}
