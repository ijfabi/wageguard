import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { ApiErrorCode, type MeResponse, type RegisterRequest } from "@wageguard/api-contracts";

import { ApiError } from "../../common/api-error.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import { Prisma, type User } from "../../generated/prisma/client.js";
import { CLOCK, type Clock } from "../../infrastructure/clock.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { AuditEventsService } from "./audit-events.service.js";
import { EMAIL_TOKEN_TTL_MS, EmailTokensService } from "./email-tokens.service.js";
import * as emails from "./emails.js";
import { PASSWORD_HASHER, type PasswordHasher } from "./password-hasher.js";
import { SessionService, type IssuedSession } from "./session.service.js";
import { TwoFactorService } from "./two-factor.service.js";

/** Hash of a random password, verified when the email is unknown so both paths cost the same. */
let dummyHash: Promise<string> | undefined;

export type LoginOutcome =
  | { readonly status: "SIGNED_IN"; readonly me: MeResponse; readonly session: IssuedSession }
  | { readonly status: "TWO_FACTOR_REQUIRED"; readonly session: IssuedSession };

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditEventsService) private readonly events: AuditEventsService,
    @Inject(EmailTokensService) private readonly tokens: EmailTokensService,
    @Inject(TwoFactorService) private readonly twoFactor: TwoFactorService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private now(): Date {
    return new Date(this.clock.now().epochMs);
  }

  /**
   * Creates the account and emails a confirmation link. The reply is the same whether or not the
   * address is already registered, so sign-up can't be used to find out who has an account: an
   * existing address gets an email saying so instead.
   */
  async register(request: RegisterRequest): Promise<void> {
    const passwordHash = await this.hasher.hash(request.password);
    const existing = await this.prisma.user.findUnique({ where: { email: request.email } });
    if (existing !== null) {
      await this.onExistingRegistration(existing);
      return;
    }
    let user;
    try {
      user = await this.prisma.user.create({ data: { email: request.email, passwordHash } });
    } catch (error: unknown) {
      // Two sign-ups with the same email can both pass the check above; the unique index decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return;
      }
      throw error;
    }
    await this.events.record("REGISTERED", user.id);
    await this.sendVerification(user);
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user !== null && user.emailVerifiedAt === null) {
      await this.sendVerification(user);
    }
  }

  /** Confirms the address and signs the user in, since they have just proved they own it. */
  async verifyEmail(token: string, userAgent?: string): Promise<{ me: MeResponse; session: IssuedSession }> {
    const userId = await this.tokens.consume(token, "VERIFY_EMAIL");
    if (userId === null) {
      throw invalidLink();
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: this.now() },
    });
    await this.events.record("EMAIL_VERIFIED", user.id);
    return { me: toMe(user), session: await this.sessions.issue(user.id, userAgent) };
  }

  async login(email: string, password: string, userAgent?: string): Promise<LoginOutcome> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    dummyHash ??= this.hasher.hash(randomBytes(32).toString("base64url"));
    const valid = await this.hasher.verify(user?.passwordHash ?? (await dummyHash), password);
    if (user === null || !valid) {
      await this.events.record("LOGIN_FAILED", user?.id ?? null, {
        reason: user === null ? "UNKNOWN_USER" : "BAD_PASSWORD",
      });
      throw new ApiError(401, ApiErrorCode.INVALID_CREDENTIALS, "Email or password is incorrect");
    }
    if (user.emailVerifiedAt === null) {
      // Only reachable with the right password, so it tells an attacker nothing new.
      await this.sendVerification(user);
      throw new ApiError(
        403,
        ApiErrorCode.EMAIL_NOT_VERIFIED,
        "Confirm your email address first. We've sent you a new link.",
      );
    }
    if (user.totpEnabledAt !== null) {
      return {
        status: "TWO_FACTOR_REQUIRED",
        session: await this.sessions.issue(user.id, userAgent, { pending: true }),
      };
    }
    await this.events.record("LOGIN_SUCCEEDED", user.id);
    return { status: "SIGNED_IN", me: toMe(user), session: await this.sessions.issue(user.id, userAgent) };
  }

  /**
   * Finishes a two-factor sign-in. The pending session is replaced by a new one, so the token
   * issued before the code was checked never becomes a full session.
   */
  async completeTwoFactor(
    userId: string,
    pendingSessionId: string,
    code: string,
    userAgent?: string,
  ): Promise<{ me: MeResponse; session: IssuedSession }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.twoFactor.check(user, code))) {
      await this.events.record("TWO_FACTOR_FAILED", userId);
      const canRetry = await this.sessions.recordFailedTwoFactor(pendingSessionId);
      throw canRetry
        ? new ApiError(401, ApiErrorCode.TWO_FACTOR_INVALID, "That code didn't work. Try the newest one.")
        : new ApiError(401, ApiErrorCode.UNAUTHENTICATED, "Too many wrong codes. Sign in again.");
    }
    await this.sessions.revoke(pendingSessionId);
    await this.events.record("LOGIN_SUCCEEDED", userId, { twoFactor: true });
    return { me: toMe(user), session: await this.sessions.issue(userId, userAgent) };
  }

  /** Always succeeds from the caller's point of view; an email goes out only if the account exists. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user === null) {
      return;
    }
    const token = await this.tokens.issue(user.id, "RESET_PASSWORD");
    if (token !== null) {
      await this.events.record("PASSWORD_RESET_REQUESTED", user.id);
      this.tokens.deliver(
        emails.resetPassword(
          user.email,
          `${this.config.appBaseUrl}/reset-password#token=${token}`,
          EMAIL_TOKEN_TTL_MS.RESET_PASSWORD / 60_000,
        ),
      );
    }
  }

  /**
   * Sets a new password from an emailed link and signs out every session. Opening the link also
   * proves the address, so an unconfirmed account becomes confirmed.
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const passwordHash = await this.hasher.hash(password);
    const userId = await this.tokens.consume(token, "RESET_PASSWORD");
    if (userId === null) {
      throw invalidLink();
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? this.now() },
    });
    await this.sessions.revokeAll(userId);
    await this.events.record("PASSWORD_RESET", userId);
    this.tokens.deliver(emails.securityNotice(user.email, "your password was reset"));
  }

  /** Changes the password and signs out every other session. */
  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.hasher.verify(user.passwordHash, currentPassword))) {
      throw new ApiError(401, ApiErrorCode.INVALID_CREDENTIALS, "Current password is incorrect");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.hasher.hash(newPassword) },
    });
    const revoked = await this.sessions.revokeAll(userId, sessionId);
    await this.events.record("PASSWORD_CHANGED", userId, { sessionsRevoked: revoked });
    this.tokens.deliver(emails.securityNotice(user.email, "your password was changed"));
  }

  async revokeOtherSessions(userId: string, sessionId: string): Promise<void> {
    const revoked = await this.sessions.revokeAll(userId, sessionId);
    await this.events.record("SESSIONS_REVOKED", userId, { count: revoked });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    if (!(await this.sessions.revokeOwned(userId, sessionId))) {
      throw new ApiError(404, ApiErrorCode.NOT_FOUND, "Session not found");
    }
    await this.events.record("SESSIONS_REVOKED", userId, { count: 1 });
  }

  async enableTwoFactor(userId: string, sessionId: string, code: string): Promise<string[]> {
    const codes = await this.twoFactor.enable(userId, code);
    // Anyone already signed in elsewhere got in without a code: sign them out.
    await this.sessions.revokeAll(userId, sessionId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    this.tokens.deliver(emails.securityNotice(user.email, "two-factor sign-in was turned on"));
    return codes;
  }

  async disableTwoFactor(userId: string, password: string, code: string): Promise<void> {
    await this.twoFactor.disable(userId, password, code);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    this.tokens.deliver(emails.securityNotice(user.email, "two-factor sign-in was turned off"));
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
    await this.events.record("LOGGED_OUT", userId);
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user === null) {
      throw new ApiError(401, ApiErrorCode.UNAUTHENTICATED, "Sign in to continue");
    }
    return toMe(user);
  }

  /**
   * Deletes the account and all of its data, including completed audits. The audit-immutability
   * trigger permits deletion only inside this transaction (SET LOCAL). The deletion itself is
   * logged without a user reference.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user === null || !(await this.hasher.verify(user.passwordHash, password))) {
      throw new ApiError(401, ApiErrorCode.INVALID_CREDENTIALS, "Password is incorrect");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('wageguard.allow_audit_delete', 'on', true)`;
      await tx.user.delete({ where: { id: userId } });
      await this.events.record("ACCOUNT_DELETED", null, {}, tx);
    });
  }

  private async sendVerification(user: User): Promise<void> {
    const token = await this.tokens.issue(user.id, "VERIFY_EMAIL");
    if (token !== null) {
      this.tokens.deliver(
        emails.verifyEmail(
          user.email,
          `${this.config.appBaseUrl}/verify-email#token=${token}`,
          EMAIL_TOKEN_TTL_MS.VERIFY_EMAIL / 3_600_000,
        ),
      );
    }
  }

  private async onExistingRegistration(user: User): Promise<void> {
    if (user.emailVerifiedAt === null) {
      // They may have lost the first email: send a fresh link.
      await this.sendVerification(user);
      return;
    }
    // Reuse the reset cooldown so repeated sign-ups can't flood the inbox either.
    const token = await this.tokens.issue(user.id, "RESET_PASSWORD");
    if (token !== null) {
      this.tokens.deliver(
        emails.alreadyRegistered(
          user.email,
          `${this.config.appBaseUrl}/login`,
          `${this.config.appBaseUrl}/reset-password#token=${token}`,
        ),
      );
    }
  }
}

function invalidLink(): ApiError {
  return new ApiError(400, ApiErrorCode.TOKEN_INVALID, "This link has expired or has already been used");
}

function toMe(user: Pick<User, "id" | "email" | "createdAt" | "totpEnabledAt">): MeResponse {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    twoFactorEnabled: user.totpEnabledAt !== null,
  };
}
