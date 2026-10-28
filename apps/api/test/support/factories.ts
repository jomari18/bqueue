import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { DocumentCode } from "@bq/shared";
import type { PrismaService } from "../../src/prisma/prisma.service.js";

export const KAPITAN_PASSWORD = "kapitan-pass-1234";
export const STAFF_PIN = "482915";
export const RESIDENT_PASSWORD = "resident-pass-1234";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const hashes = new Map<string, Promise<string>>();
/** Each constant secret is hashed once per test process. */
const hashOnce = (secret: string) => {
  if (!hashes.has(secret)) hashes.set(secret, hash(secret));
  return hashes.get(secret)!;
};

const TYPES: { code: DocumentCode; nameEn: string; nameFil: string; fee: number; validity: number; days: number; business?: boolean }[] = [
  { code: "CLEARANCE", nameEn: "Barangay Clearance", nameFil: "Barangay Clearance", fee: 10000, validity: 180, days: 1 },
  { code: "RESIDENCY", nameEn: "Certificate of Residency", nameFil: "Sertipiko ng Paninirahan", fee: 7500, validity: 180, days: 1 },
  { code: "INDIGENCY", nameEn: "Certificate of Indigency", nameFil: "Sertipiko ng Kahirapan", fee: 0, validity: 180, days: 1 },
  { code: "BUSINESS", nameEn: "Business Clearance", nameFil: "Business Clearance", fee: 50000, validity: 365, days: 3, business: true },
  { code: "BRGY_ID", nameEn: "Barangay ID", nameFil: "Barangay ID", fee: 5000, validity: 365, days: 2 },
];

let codeCounter = 0;
const nextCode = () => {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let n = codeCounter++ + Math.floor(Math.random() * 1_000_000);
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return code;
};

/** A small barangay with known logins: the kapitan, two staff, Juan (a resident with a login) and 10 residents. */
export async function seedBarangay(
  db: PrismaService,
  opts: { code?: string; now?: Date; expiresAt?: Date } = {},
) {
  const now = opts.now ?? new Date("2026-10-28T02:00:00Z");
  const code = opts.code ?? nextCode();
  const keys = { display: randomBytes(32).toString("base64url"), kiosk: randomBytes(32).toString("base64url") };
  const [kapitanHash, pinHash, residentHash] = await Promise.all([
    hashOnce(KAPITAN_PASSWORD),
    hashOnce(STAFF_PIN),
    hashOnce(RESIDENT_PASSWORD),
  ]);
  const barangay = await db.barangay.create({
    data: {
      code,
      name: "Barangay Masagana",
      city: "Lungsod ng Kalayaan",
      displayKeyHash: sha(keys.display),
      kioskKeyHash: sha(keys.kiosk),
      createdAt: now,
      lastHumanActionAt: now,
      expiresAt: opts.expiresAt ?? new Date(now.getTime() + 24 * 3600_000),
    },
  });
  const user = (role: "KAPITAN" | "STAFF" | "RESIDENT", username: string, displayName: string, secretHash: string, pin = false) =>
    db.user.create({
      data: {
        barangayId: barangay.id,
        role,
        username: `${username}.${code}`,
        displayName,
        secretHash,
        secretKind: pin ? "PIN" : "PASSWORD",
        createdAt: now,
      },
    });
  const kapitan = await user("KAPITAN", "kapitan", "Hon. Teresa Villanueva", kapitanHash);
  const staff1 = await user("STAFF", "staff1", "Ate Liza", pinHash, true);
  const staff2 = await user("STAFF", "staff2", "Kuya Ramil", pinHash, true);
  const residentUser = await user("RESIDENT", "juan", "Juan Dela Cruz", residentHash);
  const resident = await db.resident.create({
    data: {
      barangayId: barangay.id,
      userId: residentUser.id,
      fullName: "Juan Dela Cruz",
      birthDate: new Date("1990-05-14T00:00:00.000Z"),
      sex: "MALE",
      civilStatus: "MARRIED",
      purok: 3,
      addressLine: "Blk 4 Lot 12, Purok 3",
      residentSince: 2010,
      createdAt: now,
    },
  });
  const residents = await addResidents(db, barangay.id, 10, now);
  const counters = [];
  for (const [i, c] of [
    { name: "Counter 1", open: true, staffId: staff1.id },
    { name: "Counter 2", open: true, staffId: staff2.id },
    { name: "Counter 3", open: false, staffId: null },
  ].entries()) {
    counters.push(
      await db.counter.create({
        data: { barangayId: barangay.id, lanes: ["PRIORITY", "DOCUMENTS", "GENERAL"], sortOrder: i + 1, ...c },
      }),
    );
  }
  const types = {} as Record<DocumentCode, Awaited<ReturnType<typeof db.documentType.create>>>;
  for (const t of TYPES) {
    types[t.code] = await db.documentType.create({
      data: {
        barangayId: barangay.id,
        code: t.code,
        nameEn: t.nameEn,
        nameFil: t.nameFil,
        feeCentavos: t.fee,
        processingDays: t.days,
        validityDays: t.validity,
        needsBusinessName: Boolean(t.business),
      },
    });
  }
  return { barangay, kapitan, staff1, staff2, residentUser, resident, residents, counters, types, keys };
}

export type TestBarangay = Awaited<ReturnType<typeof seedBarangay>>;

/** Residents without a login, like the ones the simulator uses. */
export async function addResidents(db: PrismaService, barangayId: string, n: number, now = new Date("2026-10-28T02:00:00Z")) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: randomUUID(),
    barangayId,
    fullName: `Residente ${i + 1}`,
    birthDate: new Date("1985-01-01T00:00:00.000Z"),
    sex: (i % 2 ? "FEMALE" : "MALE") as "MALE" | "FEMALE",
    civilStatus: "SINGLE" as const,
    purok: (i % 7) + 1,
    addressLine: `Purok ${(i % 7) + 1}`,
    residentSince: 2000,
    createdAt: now,
  }));
  await db.resident.createMany({ data: rows });
  return rows;
}

/** Open counters serving every lane, for concurrency tests. */
export async function addCounters(db: PrismaService, barangayId: string, n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: randomUUID(),
    barangayId,
    name: `Extra ${i + 1}`,
    lanes: ["PRIORITY", "DOCUMENTS", "GENERAL"] as ("PRIORITY" | "DOCUMENTS" | "GENERAL")[],
    open: true,
    sortOrder: 10 + i,
  }));
  await db.counter.createMany({ data: rows });
  return rows;
}
