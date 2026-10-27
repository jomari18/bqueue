import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@bq/shared";
import { AppError } from "../common/app-error.js";
import { ROLES_KEY } from "./decorators.js";
import type { Subject } from "./subjects.js";

/** Runs after JwtAuthGuard; a signed-in role outside `@Roles(...)` gets 403 forbidden. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles) return true;
    const subject = ctx.switchToHttp().getRequest<{ subject?: Subject }>().subject;
    if (subject?.kind !== "user") throw new AppError("unauthenticated");
    if (!roles.includes(subject.role)) throw new AppError("forbidden");
    return true;
  }
}
