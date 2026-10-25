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
  /** Where rate-limit counters live. "postgres" is shared by every instance; "memory" is per process. */
  RATE_LIMIT_STORE: z.enum(["postgres", "memory"]).default("postgres"),
  /** The web app's address, used in email links. Defaults to the first allowed origin. */
  APP_BASE_URL: z.url().optional(),
  /**
   * How email is sent. "smtp" needs SMTP_URL and MAIL_FROM. "outbox" writes each message to a JSON
   * file in MAIL_OUTBOX_DIR for local development and tests, and is refused in production.
   */
  MAIL_TRANSPORT: z.enum(["smtp", "outbox"]).optional(),
  SMTP_URL: z
    .string()
    .regex(/^smtps?:\/\//, "SMTP_URL must start with smtp:// or smtps://")
    .optional(),
  MAIL_FROM: z.string().min(3).max(200).optional(),
  MAIL_OUTBOX_DIR: z.string().min(1).default(".mail-outbox"),
  /** 32 random bytes, base64. Encrypts two-factor secrets at rest. Two-factor is off without it. */
  TOTP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "TOTP_ENCRYPTION_KEY must be 32 bytes, base64")
    .optional(),
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
  readonly rateLimitStore: "postgres" | "memory";
  /** No trailing slash. */
  readonly appBaseUrl: string;
  readonly mail:
    | { readonly transport: "smtp"; readonly smtpUrl: string; readonly from: string }
    | { readonly transport: "outbox"; readonly outboxDir: string; readonly from: string };
  /** Null when two-factor sign-in is not configured. */
  readonly totpEncryptionKey: Buffer | null;
}

export const APP_CONFIG = Symbol("APP_CONFIG");

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // An empty variable (as `${NAME:-}` in Compose produces) means "not set".
  const parsed = EnvSchema.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")));
  if (!parsed.success) {
    // Names only: values may be secrets.
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production" && !e.COOKIE_SECURE) {
    throw new Error("Invalid environment configuration: COOKIE_SECURE must be true in production");
  }
  const transport = e.MAIL_TRANSPORT ?? (e.NODE_ENV === "production" ? "smtp" : "outbox");
  if (transport === "outbox" && e.NODE_ENV === "production") {
    throw new Error("Invalid environment configuration: MAIL_TRANSPORT=outbox is not allowed in production");
  }
  if (transport === "smtp" && (e.SMTP_URL === undefined || e.MAIL_FROM === undefined)) {
    throw new Error("Invalid environment configuration: SMTP_URL and MAIL_FROM are required to send email");
  }
  const allowedOrigins = e.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter((o) => o !== "");
  const from = e.MAIL_FROM ?? "WageGuard <no-reply@wageguard.localhost>";
  const smtpUrl = e.SMTP_URL ?? "";
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    allowedOrigins,
    sessionTtlMs: e.SESSION_TTL_HOURS * 3_600_000,
    cookieSecure: e.COOKIE_SECURE,
    sessionCookieName: e.COOKIE_SECURE ? "__Host-wg_session" : "wg_session",
    logLevel: e.LOG_LEVEL,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    authRateLimitPerMinute: e.AUTH_RATE_LIMIT_PER_MINUTE,
    trustProxyHops: e.TRUST_PROXY,
    rateLimitStore: e.RATE_LIMIT_STORE,
    appBaseUrl: (e.APP_BASE_URL ?? allowedOrigins[0] ?? "http://localhost:3000").replace(/\/+$/, ""),
    mail:
      transport === "smtp" ? { transport, smtpUrl, from } : { transport, outboxDir: e.MAIL_OUTBOX_DIR, from },
    totpEncryptionKey:
      e.TOTP_ENCRYPTION_KEY === undefined ? null : Buffer.from(e.TOTP_ENCRYPTION_KEY, "base64"),
  };
}
