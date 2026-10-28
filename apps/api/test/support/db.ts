import type { Config } from "../../src/config/config.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bq:bq@127.0.0.1:55434/bq_test";

/** Tests truncate tables, so they must never point at a hosted database. */
export function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to run database tests against ${host}: only a local disposable database is allowed.`);
  }
}

export function testDb(): PrismaService {
  assertLocalDatabase(TEST_DATABASE_URL);
  return new PrismaService({ DATABASE_URL: TEST_DATABASE_URL } as Config);
}

/** Empties every table; Barangay and DemoQuota are the roots, everything else cascades from Barangay. */
export async function resetDb(db: PrismaService): Promise<void> {
  await db.$executeRawUnsafe('TRUNCATE "Barangay", "DemoQuota" CASCADE');
}
