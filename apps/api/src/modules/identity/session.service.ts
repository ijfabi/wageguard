import { createHash, randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import { CLOCK, type Clock } from "../../infrastructure/clock.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";

const TOKEN_BYTES = 32;

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Opaque server-side sessions. The client holds 256 random bits; the database holds only their
 * SHA-256, so a database leak does not yield usable session tokens. Sessions expire after a fixed
 * TTL and are revoked on logout and account deletion.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async issue(userId: string): Promise<IssuedSession> {
    const now = this.clock.now().epochMs;
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(now + this.config.sessionTtlMs);
    // Expired sessions are already rejected by resolve(); this stops them accumulating.
    await this.prisma.session.deleteMany({ where: { userId, expiresAt: { lte: new Date(now) } } });
    await this.prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
    return { token, expiresAt };
  }

  /** Returns the session's user, or null for unknown or expired tokens. */
  async resolve(token: string): Promise<{ userId: string; sessionId: string } | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return null;
    }
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (session === null || session.expiresAt.getTime() <= this.clock.now().epochMs) {
      return null;
    }
    return { userId: session.userId, sessionId: session.id };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
