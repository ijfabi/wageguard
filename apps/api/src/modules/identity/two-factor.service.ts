import { createHmac } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { ApiErrorCode, type TwoFactorSetupResponse } from "@wageguard/api-contracts";

import { ApiError } from "../../common/api-error.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import type { User } from "../../generated/prisma/client.js";
import { CLOCK, type Clock } from "../../infrastructure/clock.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { AuditEventsService } from "./audit-events.service.js";
import { PASSWORD_HASHER, type PasswordHasher } from "./password-hasher.js";
import {
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSecret,
  otpauthUri,
  verifyTotp,
} from "./totp.js";

const isRecoveryCode = (code: string) => code.includes("-");

/**
 * Optional TOTP sign-in. The secret is encrypted with TOTP_ENCRYPTION_KEY before it is stored, and
 * recovery codes are stored as HMACs under the same key, so a database copy alone yields neither.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(AuditEventsService) private readonly events: AuditEventsService,
  ) {}

  /** Starts enrolment: a new secret that only takes effect once a code from it is confirmed. */
  async setup(userId: string, password: string): Promise<TwoFactorSetupResponse> {
    const key = this.key();
    const user = await this.userWithPassword(userId, password);
    if (user.totpEnabledAt !== null) {
      throw new ApiError(409, ApiErrorCode.TWO_FACTOR_STATE, "Two-factor sign-in is already on");
    }
    const secret = generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptSecret(key, secret), totpLastStep: null },
    });
    return { secret: base32Encode(secret), otpauthUri: otpauthUri(secret, user.email) };
  }

  /** Confirms enrolment with a first code and returns the recovery codes, which are shown once. */
  async enable(userId: string, code: string): Promise<string[]> {
    const key = this.key();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt !== null || user.totpSecret === null) {
      throw new ApiError(409, ApiErrorCode.TWO_FACTOR_STATE, "Start two-factor setup first");
    }
    const now = this.clock.now().epochMs;
    const step = verifyTotp(decryptSecret(key, user.totpSecret), code, now, null);
    if (step === null) {
      throw this.invalidCode();
    }
    const codes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { totpEnabledAt: new Date(now), totpLastStep: step },
      });
      await tx.recoveryCode.deleteMany({ where: { userId } });
      await tx.recoveryCode.createMany({
        data: codes.map((c) => ({ userId, codeHash: this.hashRecoveryCode(key, c) })),
      });
      await this.events.record("TWO_FACTOR_ENABLED", userId, {}, tx);
    });
    return codes;
  }

  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.userWithPassword(userId, password);
    if (user.totpEnabledAt === null) {
      throw new ApiError(409, ApiErrorCode.TWO_FACTOR_STATE, "Two-factor sign-in is not on");
    }
    if (!(await this.check(user, code))) {
      throw this.invalidCode();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
      });
      await tx.recoveryCode.deleteMany({ where: { userId } });
      await this.events.record("TWO_FACTOR_DISABLED", userId, {}, tx);
    });
  }

  /** Replaces every recovery code. */
  async regenerateRecoveryCodes(userId: string, password: string, code: string): Promise<string[]> {
    const key = this.key();
    const user = await this.userWithPassword(userId, password);
    if (user.totpEnabledAt === null) {
      throw new ApiError(409, ApiErrorCode.TWO_FACTOR_STATE, "Two-factor sign-in is not on");
    }
    if (!(await this.check(user, code))) {
      throw this.invalidCode();
    }
    const codes = generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.createMany({
        data: codes.map((c) => ({ userId, codeHash: this.hashRecoveryCode(key, c) })),
      }),
    ]);
    return codes;
  }

  /**
   * Checks an authenticator code or a recovery code, and uses it up: the TOTP step is recorded so the
   * same code can't be replayed, and a recovery code is marked used.
   */
  async check(user: Pick<User, "id" | "totpSecret" | "totpLastStep">, code: string): Promise<boolean> {
    const key = this.key();
    if (user.totpSecret === null) {
      return false;
    }
    if (isRecoveryCode(code)) {
      const { count } = await this.prisma.recoveryCode.updateMany({
        where: { userId: user.id, codeHash: this.hashRecoveryCode(key, code), usedAt: null },
        data: { usedAt: new Date(this.clock.now().epochMs) },
      });
      return count === 1;
    }
    const step = verifyTotp(
      decryptSecret(key, user.totpSecret),
      code,
      this.clock.now().epochMs,
      user.totpLastStep,
    );
    if (step === null) {
      return false;
    }
    // Conditional on the old value, so two requests racing with the same code can't both pass.
    const { count } = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      },
      data: { totpLastStep: step },
    });
    return count === 1;
  }

  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.recoveryCode.count({ where: { userId, usedAt: null } });
  }

  private key(): Buffer {
    if (this.config.totpEncryptionKey === null) {
      throw new ApiError(
        503,
        ApiErrorCode.TWO_FACTOR_UNAVAILABLE,
        "Two-factor sign-in isn't set up on this server",
      );
    }
    return this.config.totpEncryptionKey;
  }

  private hashRecoveryCode(key: Buffer, code: string): string {
    return createHmac("sha256", key).update(`recovery:${code.toLowerCase()}`).digest("hex");
  }

  private async userWithPassword(userId: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user === null || !(await this.hasher.verify(user.passwordHash, password))) {
      throw new ApiError(401, ApiErrorCode.INVALID_CREDENTIALS, "Password is incorrect");
    }
    return user;
  }

  private invalidCode(): ApiError {
    return new ApiError(401, ApiErrorCode.TWO_FACTOR_INVALID, "That code didn't work. Try the newest one.");
  }
}
