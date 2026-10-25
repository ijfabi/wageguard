import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Where the API started by Playwright writes emails instead of sending them (git-ignored). */
export const MAIL_OUTBOX_DIR = path.resolve(import.meta.dirname, "..", "..", "..", ".mail-outbox", "e2e");

/** The newest link to `page` emailed to `to`, waiting briefly because emails are sent asynchronously. */
export async function emailedLink(to: string, page: "verify-email" | "reset-password"): Promise<string> {
  const pattern = new RegExp(String.raw`https?://\S+/${page}#token=[A-Za-z0-9_-]{43}`);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const files = (await readdir(MAIL_OUTBOX_DIR).catch(() => [] as string[])).sort().reverse();
    for (const file of files) {
      const message = JSON.parse(await readFile(path.join(MAIL_OUTBOX_DIR, file), "utf8")) as {
        to: string;
        text: string;
      };
      const link = message.to === to ? pattern.exec(message.text)?.[0] : undefined;
      if (link !== undefined) {
        return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No ${page} email for ${to}`);
}
