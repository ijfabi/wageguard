import type { MailMessage } from "../../infrastructure/mailer.js";

/**
 * Account emails. Links carry the token in the URL fragment, which browsers never send to a
 * server or include in a Referer header, so it can't leak through logs or third-party requests.
 */

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function message(to: string, subject: string, paragraphs: string[], action?: { label: string; url: string }) {
  const text = [...paragraphs, ...(action === undefined ? [] : [`${action.label}: ${action.url}`])].join(
    "\n\n",
  );
  const html = [
    '<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#14213d;max-width:560px">',
    ...paragraphs.map((p) => `<p>${escape(p)}</p>`),
    ...(action === undefined
      ? []
      : [
          `<p><a href="${escape(action.url)}" style="display:inline-block;padding:10px 18px;background:#14532d;color:#fff;border-radius:6px;text-decoration:none">${escape(action.label)}</a></p>`,
          `<p style="font-size:13px;color:#555">Or paste this link into your browser: ${escape(action.url)}</p>`,
        ]),
    '<p style="font-size:13px;color:#555">WageGuard is an information tool, not legal advice.</p>',
    "</div>",
  ].join("");
  return { to, subject, text, html } satisfies MailMessage;
}

export function verifyEmail(to: string, url: string, hours: number): MailMessage {
  return message(
    to,
    "Confirm your email for WageGuard",
    [
      "Thanks for signing up to WageGuard. Confirm this is your email address to finish creating your account.",
      `The link works once and expires in ${hours} hours. If you didn't sign up, you can ignore this email.`,
    ],
    { label: "Confirm email", url },
  );
}

/** Sent instead of a verification link when someone signs up with an address that already has an account. */
export function alreadyRegistered(to: string, signInUrl: string, resetUrl: string): MailMessage {
  return message(to, "You already have a WageGuard account", [
    "Someone tried to create a WageGuard account with this email address, but it already has one.",
    `If that was you, sign in at ${signInUrl}. If you've forgotten your password, you can reset it at ${resetUrl}.`,
    "If it wasn't you, you don't need to do anything. Your account hasn't changed.",
  ]);
}

export function resetPassword(to: string, url: string, minutes: number): MailMessage {
  return message(
    to,
    "Reset your WageGuard password",
    [
      "We received a request to reset the password for your WageGuard account.",
      `The link works once and expires in ${minutes} minutes. Resetting your password signs you out everywhere. If you didn't ask for this, ignore this email and your password stays the same.`,
    ],
    { label: "Choose a new password", url },
  );
}

export function securityNotice(to: string, what: string): MailMessage {
  return message(to, `WageGuard security notice: ${what}`, [
    `This is to let you know that the following change was made to your WageGuard account: ${what}.`,
    "If you made this change, you don't need to do anything. If you didn't, reset your password straight away, which also signs out every device.",
  ]);
}
