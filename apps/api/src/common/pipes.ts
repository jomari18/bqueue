import { type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { AppError } from "./app-error.js";

/** Validates a body or query with a shared zod schema; a ZodError becomes 400 invalid_input in ErrorFilter. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    return this.schema.parse(value ?? {});
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id answers 404, like an id from another barangay. */
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) throw new AppError("not_found");
    return value.toLowerCase();
  }
}
