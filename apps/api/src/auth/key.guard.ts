import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppError } from "../common/app-error.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { KeysService } from "./keys.service.js";
import type { Subject } from "./subjects.js";

const KEY_KINDS = "bq:key-kinds";
type KeyKind = "display" | "kiosk";
const HEADER: Record<KeyKind, string> = { display: "x-display-key", kiosk: "x-kiosk-key" };

/** Which key headers a handler accepts. */
export const KeyKinds = (...kinds: KeyKind[]) => SetMetadata(KEY_KINDS, kinds);

type WithSubject = Request & { subject?: Subject };

async function keySubject(keys: KeysService, req: Request, kinds: KeyKind[]): Promise<Subject | null> {
  for (const kind of kinds) {
    const key = req.header(HEADER[kind]);
    if (key) return keys.subjectForKey(kind, key);
  }
  return null;
}

/** A TV display or kiosk proving its key in `X-Display-Key` or `X-Kiosk-Key`. */
@Injectable()
export class KeyGuard implements CanActivate {
  constructor(
    private readonly keys: KeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const kinds = this.reflector.getAllAndOverride<KeyKind[]>(KEY_KINDS, [ctx.getHandler(), ctx.getClass()]) ?? [];
    const req = ctx.switchToHttp().getRequest<WithSubject>();
    const subject = await keySubject(this.keys, req, kinds);
    if (!subject) throw new AppError("unauthenticated");
    req.subject = subject;
    return true;
  }
}

/** The public queue may be read with a bearer token or with a display or kiosk key (spec 9.4). */
@Injectable()
export class QueueReaderGuard implements CanActivate {
  constructor(
    private readonly keys: KeysService,
    private readonly jwt: JwtAuthGuard,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<WithSubject>();
    if (req.header("authorization")) return this.jwt.canActivate(ctx);
    const subject = await keySubject(this.keys, req, ["display", "kiosk"]);
    if (!subject) throw new AppError("unauthenticated");
    req.subject = subject;
    return true;
  }
}
