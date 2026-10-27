import { type ApiErrorBody, ERROR_MESSAGES, ERROR_STATUS, pickLanguage } from "@bq/shared";
import type { Request, Response } from "express";
import type { AppError } from "./app-error.js";

/** Writes an AppError as `{ error: { code, message, field?, retryAfter? } }`, in the visitor's language. */
export function sendError(req: Request, res: Response, err: AppError): void {
  const lang = pickLanguage(req.headers["accept-language"]);
  const message = (err.bilingual ?? ERROR_MESSAGES[err.code])[lang];
  const body: ApiErrorBody & Record<string, unknown> = {
    error: {
      code: err.code,
      message,
      ...(err.field ? { field: err.field } : {}),
      ...(err.retryAfter ? { retryAfter: err.retryAfter.toISOString() } : {}),
    },
    ...err.extra,
  };
  res.status(ERROR_STATUS[err.code]).json(body);
}
