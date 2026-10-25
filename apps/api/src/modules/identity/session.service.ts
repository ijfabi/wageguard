import { createHash, randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { SessionSummary } from "@wageguard/api-contracts";

import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import { CLOCK, type Clock } from "../../infrastructure/clock.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";

const TOKEN_BYTES = 32;
/** A session waiting for a two-factor code lasts this long. */
export const PENDING_SESSION_TTL_MS = 10 * 60 * 1000;
/** Wrong codes allowed against one pending session before it is thrown away. */
export const MAX_TWO_FACTOR_ATTEMPTS = 5;
/** lastSeenAt is only rewritten when it is older than this, so reads don't each cause a write. */
const LAST_SEEN_RESOLUTION_MS = 5 * 60 * 1000;

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
  /** Max-Age for the cookie. */
  readonly ttlMs: number;
}

export interface ResolvedSession {
  readonly userId: string;
  readonly sessionId: string;
  /** False while a two-factor code is still owed. */
  readonly verified: boolean;
}

/**
 * Opaque server-side sessions. The client holds 256 random bits; the database holds only their
 * SHA-256, so a database leak does not yield usable session tokens. Sessions expire after a fixed
 * TTL and are revoked on logout, password changes and account deletion.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** A full session, or with `pending` one that can only be used to enter a two-factor code. */
  async issue(
    userId: string,
    userAgent?: string,
    options: { pending?: boolean } = {},
  ): Promise<IssuedSession> {
    const now = this.clock.now().epochMs;
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const ttlMs = options.pending === true ? PENDING_SESSION_TTL_MS : this.config.sessionTtlMs;
    const expiresAt = new Date(now + ttlMs);
    // Expired sessions are already rejected by resolve(); this stops them accumulating.
    await this.prisma.session.deleteMany({ where: { userId, expiresAt: { lte: new Date(now) } } });
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        verified: options.pending !== true,
        lastSeenAt: new Date(now),
        device: describeDevice(userAgent),
      },
    });
    return { token, expiresAt, ttlMs };
  }

  /** Returns the session, or null for unknown or expired tokens. */
  async resolve(token: string): Promise<ResolvedSession | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return null;
    }
    const now = this.clock.now().epochMs;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (session === null || session.expiresAt.getTime() <= now) {
      return null;
    }
    if (now - session.lastSeenAt.getTime() >= LAST_SEEN_RESOLUTION_MS) {
      await this.prisma.session.updateMany({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }
    return { userId: session.userId, sessionId: session.id, verified: session.verified };
  }

  /**
   * Counts a wrong two-factor code against a pending session. Returns false, and deletes the
   * session, once the limit is reached.
   */
  async recordFailedTwoFactor(sessionId: string): Promise<boolean> {
    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: { twoFactorAttempts: { increment: 1 } },
      select: { twoFactorAttempts: true },
    });
    if (updated.twoFactorAttempts >= MAX_TWO_FACTOR_ATTEMPTS) {
      await this.revoke(sessionId);
      return false;
    }
    return true;
  }

  async list(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, verified: true, expiresAt: { gt: new Date(this.clock.now().epochMs) } },
      orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }],
    });
    return rows.map((s) => ({
      id: s.id,
      device: s.device,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      current: s.id === currentSessionId,
    }));
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  /** Revokes one of the user's sessions. Returns false when it isn't theirs or doesn't exist. */
  async revokeOwned(userId: string, sessionId: string): Promise<boolean> {
    const { count } = await this.prisma.session.deleteMany({ where: { id: sessionId, userId } });
    return count > 0;
  }

  /** Signs the user out everywhere, optionally keeping the session making the request. */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: { userId, ...(exceptSessionId === undefined ? {} : { id: { not: exceptSessionId } }) },
    });
    return count;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * "Firefox on Windows", for the sessions list. Only the browser family and platform are kept: the
 * full user agent is a fingerprint and isn't needed.
 */
export function describeDevice(userAgent: string | undefined): string | null {
  if (userAgent === undefined || userAgent === "") {
    return null;
  }
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : null;
  const platform = /iPhone|iPad|iPod/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "macOS"
          : /CrOS/.test(userAgent)
            ? "ChromeOS"
            : /Linux/.test(userAgent)
              ? "Linux"
              : null;
  if (browser === null && platform === null) {
    return "Unknown device";
  }
  return [browser ?? "Browser", platform === null ? null : `on ${platform}`].filter(Boolean).join(" ");
}
