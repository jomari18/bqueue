import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { CONFIG, type Config } from "../config/config.js";
import { PrismaClient } from "../generated/prisma/client.js";

/** The Prisma client over node-postgres; Neon's pooled URL in production, a local database in tests. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(CONFIG) config: Config) {
    super({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL, max: 10 }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** The client inside an interactive transaction. */
export type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];
