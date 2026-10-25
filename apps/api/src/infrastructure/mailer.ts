import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createTransport } from "nodemailer";

import type { AppConfig } from "../config/config.js";

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Port: sends one email. Implementations must never log the body, which can contain sign-in links. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol("MAILER");

/** Sends through an SMTP relay. Credentials come from SMTP_URL, never from source control. */
export function smtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = createTransport(smtpUrl);
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}

/**
 * Development only: writes each message to a JSON file instead of sending it, so links can be
 * opened locally and end-to-end tests can read them. The directory is git-ignored.
 */
export function outboxMailer(directory: string, from: string): Mailer {
  return {
    async send(message) {
      await mkdir(directory, { recursive: true });
      const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`;
      await writeFile(path.join(directory, name), JSON.stringify({ from, ...message }, null, 2), "utf8");
    },
  };
}

export function mailerFor(config: AppConfig): Mailer {
  return config.mail.transport === "smtp"
    ? smtpMailer(config.mail.smtpUrl, config.mail.from)
    : outboxMailer(config.mail.outboxDir, config.mail.from);
}
