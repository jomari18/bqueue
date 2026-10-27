import { Inject, Injectable } from "@nestjs/common";
import type {
  BarangayView,
  CounterInput,
  CounterPatch,
  CounterView,
  DocumentTypePatch,
  DocumentTypeView,
  KeyRotationResult,
  StaffInput,
  StaffPatch,
  StaffView,
} from "@bq/shared";
import { AuthService } from "../auth/auth.service.js";
import { hashSecret } from "../auth/hashing.js";
import { newOpaqueToken } from "../auth/tokens.js";
import { toBarangayView } from "../auth/views.js";
import { AppError } from "../common/app-error.js";
import { CLOCK, type Clock } from "../common/clock.js";
import { SocketHub } from "../common/socket-hub.js";
import { CONFIG, type Config } from "../config/config.js";
import { toDocumentTypeView } from "../documents/views.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { counterViews } from "../queue/counter-views.js";

const MAX_COUNTERS = 10;
const MAX_STAFF = 10;

/** The kapitan's settings (spec 9.7). Every method is scoped to the kapitan's barangay. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthService,
    private readonly hub: SocketHub,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async documentTypes(barangayId: string): Promise<DocumentTypeView[]> {
    const rows = await this.db.documentType.findMany({ where: { barangayId }, orderBy: { code: "asc" } });
    return rows.map(toDocumentTypeView);
  }

  /** A new fee applies to new requests; submitted requests keep the fee they were submitted with. */
  async patchDocumentType(barangayId: string, id: string, patch: DocumentTypePatch): Promise<DocumentTypeView> {
    const { count } = await this.db.documentType.updateMany({ where: { id, barangayId }, data: patch });
    if (count === 0) throw new AppError("not_found");
    return toDocumentTypeView(await this.db.documentType.findUniqueOrThrow({ where: { id } }));
  }

  counters(barangayId: string): Promise<CounterView[]> {
    return counterViews(this.db, barangayId);
  }

  async addCounter(barangayId: string, input: CounterInput): Promise<CounterView> {
    const existing = await this.db.counter.findMany({ where: { barangayId }, select: { sortOrder: true } });
    if (existing.length >= MAX_COUNTERS) throw new AppError("limit_reached");
    const sortOrder = Math.max(0, ...existing.map((c) => c.sortOrder)) + 1;
    const counter = await this.db.counter.create({ data: { barangayId, name: input.name, lanes: input.lanes, open: false, sortOrder } });
    return (await counterViews(this.db, barangayId, [counter.id]))[0]!;
  }

  async patchCounter(barangayId: string, id: string, patch: CounterPatch): Promise<CounterView> {
    const { count } = await this.db.counter.updateMany({ where: { id, barangayId }, data: patch });
    if (count === 0) throw new AppError("not_found");
    return (await counterViews(this.db, barangayId, [id]))[0]!;
  }

  async staff(barangayId: string): Promise<StaffView[]> {
    const rows = await this.db.user.findMany({
      where: { barangayId, role: "STAFF" },
      include: { counters: { select: { name: true }, take: 1 } },
      orderBy: { username: "asc" },
    });
    return rows.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      active: u.active,
      counterName: u.counters[0]?.name ?? null,
    }));
  }

  /** New staff log in as staff{n}.{code}, with the next free n from 3 (staff1 and staff2 are the demo's). */
  async addStaff(barangayId: string, input: StaffInput): Promise<StaffView> {
    const barangay = await this.db.barangay.findUniqueOrThrow({ where: { id: barangayId } });
    const staff = await this.db.user.findMany({ where: { barangayId, role: "STAFF" }, select: { username: true } });
    if (staff.length >= MAX_STAFF) throw new AppError("limit_reached");
    const taken = staff.map((s) => Number(/^staff(\d+)\./.exec(s.username)?.[1] ?? 0));
    const n = Math.max(2, ...taken) + 1;
    const user = await this.db.user.create({
      data: {
        barangayId,
        role: "STAFF",
        username: `staff${n}.${barangay.code}`,
        displayName: input.displayName,
        secretHash: await hashSecret(input.pin),
        secretKind: "PIN",
        createdAt: this.clock.now(),
      },
    });
    return this.oneStaff(barangayId, user.id);
  }

  /** A new PIN, or deactivation: sessions end, sockets close (Task 19) and the person leaves their counter. */
  async patchStaff(barangayId: string, id: string, patch: StaffPatch): Promise<StaffView> {
    const user = await this.db.user.findFirst({ where: { id, barangayId, role: "STAFF" } });
    if (!user) throw new AppError("not_found");
    await this.db.user.update({
      where: { id },
      data: {
        ...(patch.pin ? { secretHash: await hashSecret(patch.pin), failedAttempts: 0, lockedUntil: null } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    if (patch.active === false) {
      await this.auth.revokeUserSessions(id);
      await this.db.counter.updateMany({ where: { barangayId, staffId: id }, data: { staffId: null } });
    }
    return this.oneStaff(barangayId, id);
  }

  /** A new display or kiosk link; screens still using the old one are disconnected (spec 7.3). */
  async rotateKey(barangayId: string, kind: "display" | "kiosk"): Promise<KeyRotationResult> {
    const key = newOpaqueToken();
    await this.db.barangay.update({
      where: { id: barangayId },
      data: kind === "display" ? { displayKeyHash: key.hash } : { kioskKeyHash: key.hash },
    });
    await this.hub.disconnectKind(`b:${barangayId}:public`, kind);
    return { link: `${this.config.SITE_ORIGIN}/${kind}#${key.token}` };
  }

  async setSimulator(barangayId: string, on: boolean): Promise<BarangayView> {
    return toBarangayView(await this.db.barangay.update({ where: { id: barangayId }, data: { simulatorOn: on } }));
  }

  private async oneStaff(barangayId: string, id: string): Promise<StaffView> {
    return (await this.staff(barangayId)).find((s) => s.id === id)!;
  }
}
