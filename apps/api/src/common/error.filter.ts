import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, NotFoundException } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Logger } from "pino";
import { ZodError } from "zod";
import { AppError } from "./app-error.js";
import { sendError } from "./send-error.js";

/** Every error leaves the API in the spec 9.9 format; unexpected ones are logged without the request body. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    sendError(req, res, this.toAppError(exception));
  }

  private toAppError(exception: unknown): AppError {
    if (exception instanceof AppError) return exception;
    if (exception instanceof ZodError) {
      const issue = exception.issues[0];
      const field = issue && issue.path.length > 0 ? issue.path.join(".") : undefined;
      return new AppError("invalid_input", { field });
    }
    if (exception instanceof NotFoundException) return new AppError("not_found");
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 401) return new AppError("unauthenticated");
      if (status === 403) return new AppError("forbidden");
      if (status === 400) return new AppError("invalid_input");
    }
    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error({ err: { name: err.name, stack: err.stack } }, "unhandled error");
    return new AppError("service_unavailable");
  }
}
