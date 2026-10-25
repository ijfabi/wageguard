import { createHash, randomBytes } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";

import type { EmailTokenPurpose } from "../../generated/prisma/client.js";
import { CLOCK, type Clock } from "../../infrastructure/clock.js";
import { MAILER, type MailMessage, type Mailer } from "../../infrastructure/mailer.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";

export const EMAIL_TOKEN_TTL_MS: Readonly<Record<EmailTokenPurpose, number>> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 30 * 60 * 1000,
};
/** One email of each kind per address per minute, so the endpoints can't be used to flood an inbox. */
const RESEND_COOLDOWN_MS = 60 * 1000;

const hash = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

/** Single-use links sent by email. Only the SHA-256 of each token is stored. */
@Injectable()
export class EmailTokensService {
  private readonly logger = new Logger(EmailTokensService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /**
   * Creates a token, or returns null when one of the same kind was sent within the last minute.
   * Older unused tokens of the same kind stop working, so only the newest link is valid.
   */
  async issue(userId: string, purpose: EmailTokenPurpose): Promise<string | null> {
    const now = this.clock.now().epochMs;
    const recent = await this.prisma.emailToken.findFirst({
      where: { userId, purpose, createdAt: { gt: new Date(now - RESEND_COOLDOWN_MS) } },
      select: { id: true },
    });
    if (recent !== null) {
      return null;
    }
    const token = randomBytes(32).toString("base64url");
    await this.prisma.$transaction([
      this.prisma.emailToken.deleteMany({
        where: { userId, OR: [{ purpose, usedAt: null }, { expiresAt: { lte: new Date(now) } }] },
      }),
      this.prisma.emailToken.create({
        data: {
          userId,
          purpose,
          tokenHash: hash(token),
          createdAt: new Date(now),
          expiresAt: new Date(now + EMAIL_TOKEN_TTL_MS[purpose]),
        },
      }),
    ]);
    return token;
  }

  /** Uses up a token and returns its user, or null when it is unknown, expired or already used. */
  async consume(token: string, purpose: EmailTokenPurpose): Promise<string | null> {
    const now = new Date(this.clock.now().epochMs);
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: hash(token) } });
    if (row === null || row.purpose !== purpose || row.usedAt !== null || row.expiresAt <= now) {
      return null;
    }
    // The usedAt condition makes this the single winner if the same link is opened twice at once.
    const { count } = await this.prisma.emailToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    return count === 1 ? row.userId : null;
  }

  /**
   * Sends without making the caller wait. The reply to a request must not depend on whether an
   * email went out, or its timing would reveal which addresses have accounts.
   */
  deliver(message: MailMessage): void {
    this.mailer.send(message).catch((error: unknown) => {
      // The subject is safe to log. The body holds the link, and SMTP error messages can quote the
      // recipient, so only the error's name and code are kept.
      const { name, code } = error as { name?: unknown; code?: unknown };
      this.logger.error(
        { subject: message.subject, errorName: String(name), errorCode: String(code) },
        "Email could not be sent",
      );
    });
  }
}
