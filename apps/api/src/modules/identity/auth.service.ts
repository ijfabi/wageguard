import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { ApiErrorCode, type MeResponse, type RegisterRequest } from "@wageguard/api-contracts";

import { ApiError } from "../../common/api-error.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { AuditEventsService } from "./audit-events.service.js";
import { PASSWORD_HASHER, type PasswordHasher } from "./password-hasher.js";
import { SessionService, type IssuedSession } from "./session.service.js";

/** Hash of a random password, verified when the email is unknown so both paths cost the same. */
let dummyHash: Promise<string> | undefined;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditEventsService) private readonly events: AuditEventsService,
  ) {}

  async register(request: RegisterRequest): Promise<{ me: MeResponse; session: IssuedSession }> {
    const passwordHash = await this.hasher.hash(request.password);
    const existing = await this.prisma.user.findUnique({
      where: { email: request.email },
      select: { id: true },
    });
    if (existing !== null) {
      throw new ApiError(409, ApiErrorCode.EMAIL_TAKEN, "An account with this email already exists");
    }
    const user = await this.prisma.user.create({ data: { email: request.email, passwordHash } });
    await this.events.record("REGISTERED", user.id);
    return { me: toMe(user), session: await this.sessions.issue(user.id) };
  }

  async login(email: string, password: string): Promise<{ me: MeResponse; session: IssuedSession }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    dummyHash ??= this.hasher.hash(randomBytes(32).toString("base64url"));
    const valid = await this.hasher.verify(user?.passwordHash ?? (await dummyHash), password);
    if (user === null || !valid) {
      await this.events.record("LOGIN_FAILED", user?.id ?? null, {
        reason: user === null ? "UNKNOWN_USER" : "BAD_PASSWORD",
      });
      throw new ApiError(401, ApiErrorCode.INVALID_CREDENTIALS, "Email or password is incorrect");
    }
    await this.events.record("LOGIN_SUCCEEDED", user.id);
    return { me: toMe(user), session: await this.sessions.issue(user.id) };
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
}

function toMe(user: { id: string; email: string; createdAt: Date }): MeResponse {
  return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
}
