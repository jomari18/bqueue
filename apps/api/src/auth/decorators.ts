import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Role } from "@bq/shared";
import type { AuthUser, Subject } from "./subjects.js";

export const ROLES_KEY = "bq:roles";

/** The roles allowed on a handler or controller (spec 7.4). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

type WithSubject = { subject?: Subject };

export const CurrentSubject = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Subject => ctx.switchToHttp().getRequest<WithSubject>().subject!,
);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const subject = ctx.switchToHttp().getRequest<WithSubject>().subject;
  if (subject?.kind !== "user") throw new Error("CurrentUser used without JwtAuthGuard");
  return subject;
});
