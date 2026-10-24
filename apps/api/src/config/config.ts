import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((v) => v === "true");

/** Environment contract. The process refuses to start if this does not validate. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a PostgreSQL URL"),
  /** Comma-separated origins allowed to make state-changing browser requests. */
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(12),
  COOKIE_SECURE: booleanString.default(false),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  /**
   * Proxies in front of the API whose X-Forwarded-For can be trusted (for example 1 behind a load
   * balancer). 0 ignores the header, so clients cannot choose their own rate-limit identity.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly port: number;
  readonly databaseUrl: string;
  readonly allowedOrigins: readonly string[];
  readonly sessionTtlMs: number;
  readonly cookieSecure: boolean;
  /** `__Host-` prefix requires Secure; used whenever cookies are Secure. */
  readonly sessionCookieName: string;
  readonly logLevel: string;
  readonly rateLimitPerMinute: number;
  readonly authRateLimitPerMinute: number;
  readonly trustProxyHops: number;
}

export const APP_CONFIG = Symbol("APP_CONFIG");

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Names only: values may be secrets.
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production" && !e.COOKIE_SECURE) {
    throw new Error("Invalid environment configuration: COOKIE_SECURE must be true in production");
  }
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    allowedOrigins: e.ALLOWED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter((o) => o !== ""),
    sessionTtlMs: e.SESSION_TTL_HOURS * 3_600_000,
    cookieSecure: e.COOKIE_SECURE,
    sessionCookieName: e.COOKIE_SECURE ? "__Host-wg_session" : "wg_session",
    logLevel: e.LOG_LEVEL,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    authRateLimitPerMinute: e.AUTH_RATE_LIMIT_PER_MINUTE,
    trustProxyHops: e.TRUST_PROXY,
  };
}
