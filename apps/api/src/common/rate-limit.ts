import { SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { ThrottlerModuleOptions, ThrottlerStorage } from "@nestjs/throttler";

import type { AppConfig } from "../config/config.js";
import type { Clock } from "../infrastructure/clock.js";
import type { PrismaService } from "../infrastructure/prisma.service.js";

const AUTH_RATE_LIMITED = "wageguard:authRateLimited";

/** Applies the stricter credential-endpoint limit (brute-force protection) in addition to the default. */
export const AuthRateLimited = (): MethodDecorator => SetMetadata(AUTH_RATE_LIMITED, true);

const isAuthRateLimited = (context: ExecutionContext): boolean =>
  Reflect.getMetadata(AUTH_RATE_LIMITED, context.getHandler()) === true;

/** Share of requests that also delete long-expired counters. */
const SWEEP_PROBABILITY = 0.01;

/**
 * Fixed-window counters in PostgreSQL, so every API instance shares one budget per client. Each
 * request is one upsert on the counter's primary key: it starts a new window when the old one has
 * ended, and otherwise adds a hit. Once a client goes over the limit the window is stretched to
 * the block duration, and further requests are refused until it ends.
 */
export class PostgresThrottlerStorage implements ThrottlerStorage {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<Awaited<ReturnType<ThrottlerStorage["increment"]>>> {
    const nowMs = this.clock.now().epochMs;
    const now = new Date(nowMs);
    const windowEnd = new Date(nowMs + ttl);
    const blockEnd = new Date(nowMs + blockDuration);
    const bucket = `${throttlerName}:${key}`.slice(0, 200);
    const [row] = await this.prisma.$queryRaw<{ hits: number; window_end: Date }[]>`
      INSERT INTO "rate_limit_buckets" ("key", "window_end", "hits")
      VALUES (${bucket}, ${windowEnd}, 1)
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE WHEN "rate_limit_buckets"."window_end" <= ${now} THEN 1
                      ELSE "rate_limit_buckets"."hits" + 1 END,
        "window_end" = CASE
          WHEN "rate_limit_buckets"."window_end" <= ${now} THEN ${windowEnd}
          WHEN "rate_limit_buckets"."hits" + 1 = ${limit + 1} THEN GREATEST("rate_limit_buckets"."window_end", ${blockEnd})
          ELSE "rate_limit_buckets"."window_end" END
      RETURNING "hits", "window_end"`;
    if (Math.random() < SWEEP_PROBABILITY) {
      await this.prisma.rateLimitBucket.deleteMany({ where: { windowEnd: { lt: new Date(nowMs - ttl) } } });
    }
    if (row === undefined) {
      throw new Error("Rate-limit upsert returned no row");
    }
    const hits = row.hits;
    const secondsLeft = Math.max(1, Math.ceil((row.window_end.getTime() - nowMs) / 1000));
    const isBlocked = hits > limit;
    return {
      totalHits: hits,
      timeToExpire: secondsLeft,
      isBlocked,
      timeToBlockExpire: isBlocked ? secondsLeft : 0,
    };
  }
}

/**
 * Two named throttlers, keyed by client IP: a general limit on every route, and a stricter one
 * that only counts routes marked @AuthRateLimited(). Counters live in PostgreSQL by default, so the
 * limits hold across instances; RATE_LIMIT_STORE=memory keeps them in the process instead.
 */
export function throttlerOptions(
  config: AppConfig,
  prisma: PrismaService,
  clock: Clock,
): ThrottlerModuleOptions {
  return {
    throttlers: [
      { name: "default", ttl: 60_000, limit: config.rateLimitPerMinute },
      {
        name: "auth",
        ttl: 60_000,
        limit: config.authRateLimitPerMinute,
        skipIf: (context) => !isAuthRateLimited(context),
      },
    ],
    ...(config.rateLimitStore === "postgres" ? { storage: new PostgresThrottlerStorage(prisma, clock) } : {}),
  };
}
