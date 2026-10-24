import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { PrismaClient } from "../generated/prisma/client.js";

/** The single Prisma client for the process, using the node-postgres driver adapter. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        // Without a limit, requests wait indefinitely for a connection while the database is down
        // (Benchmark E: requests hung until the client gave up). Failing after 3 s lets the API
        // answer 503 with Retry-After instead.
        connectionTimeoutMillis: 3_000,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
