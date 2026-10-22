import { SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { ThrottlerModuleOptions } from "@nestjs/throttler";

import type { AppConfig } from "../config/config.js";

const AUTH_RATE_LIMITED = "wageguard:authRateLimited";

/** Applies the stricter credential-endpoint limit (brute-force protection) in addition to the default. */
export const AuthRateLimited = (): MethodDecorator => SetMetadata(AUTH_RATE_LIMITED, true);

const isAuthRateLimited = (context: ExecutionContext): boolean =>
  Reflect.getMetadata(AUTH_RATE_LIMITED, context.getHandler()) === true;

/**
 * Two named throttlers, keyed by client IP: a general limit on every route, and a stricter one
 * that only counts routes marked @AuthRateLimited(). Storage is in-process memory, which is correct
 * for a single instance; multiple instances would need a shared store (e.g. Redis).
 */
export function throttlerOptions(config: AppConfig): ThrottlerModuleOptions {
  return [
    { name: "default", ttl: 60_000, limit: config.rateLimitPerMinute },
    {
      name: "auth",
      ttl: 60_000,
      limit: config.authRateLimitPerMinute,
      skipIf: (context) => !isAuthRateLimited(context),
    },
  ];
}
