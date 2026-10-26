/**
 * Records the end-to-end demonstration in docs/demo.md: a brand-new synthetic user goes from sign-up
 * to a downloaded PDF report, with a screenshot at each step (docs/walkthrough/).
 *
 *   docker compose up --build        # in another terminal
 *   pnpm --filter @wageguard/web walkthrough
 *
 * The confirmation email is read from the stack's Mailpit inbox (MAILPIT_URL, default
 * http://127.0.0.1:8025), exactly as a person would open it.
 *
 * The account is created on the spot with a random password that is never written down. The same
 * flow runs as an automated Playwright test in CI (e2e/journey.spec.ts).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { chromium, type Page } from "@playwright/test";

const BASE_URL = process.env["WEB_URL"] ?? "http://localhost:3000";
const OUT = path.resolve(import.meta.dirname, "..", "..", "..", "docs", "walkthrough");
const EMAIL = `walkthrough-${randomUUID().slice(0, 8)}@example.test`;
const PASSWORD = randomBytes(18).toString("base64url");
const MAILPIT_URL = process.env["MAILPIT_URL"] ?? "http://127.0.0.1:8025";

/** The confirmation link from the newest email to `to` in Mailpit. */
async function confirmationLink(to: string): Promise<string> {
  for (let attempt = 0; attempt < 75; attempt += 1) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?limit=1&query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    const id = messages[0]?.ID;
    if (id !== undefined) {
      const { Text } = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as {
        Text: string;
      };
      const link = /https?:\/\/\S+\/verify-email#token=[A-Za-z0-9_-]{43}/.exec(Text)?.[0];
      if (link !== undefined) {
        return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No confirmation email for ${to} in ${MAILPIT_URL}`);
}

/** A fortnight of casual shifts (golden scenario G009: the award minimum is $862.15). */
const TIMESHEET = [
  "start,end,meal_start,meal_end",
  "2026-07-06T09:00,2026-07-06T17:00,2026-07-06T12:00,2026-07-06T12:30",
  "2026-07-11T08:00,2026-07-11T16:30,2026-07-11T12:00,2026-07-11T12:30",
  "2026-07-12T10:00,2026-07-12T16:00,2026-07-12T13:00,2026-07-12T13:30",
  "",
].join("\n");

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  // Let notifications from the previous step close, so they don't cover the page.
  await page.waitForFunction(() => document.querySelectorAll("[data-sonner-toast]").length === 0, null, {
    timeout: 10_000,
  });
  await page.mouse.move(0, 0); // no stray hover states in the capture
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`saved ${name}.png`);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  colorScheme: "light",
  reducedMotion: "reduce",
  acceptDownloads: true,
});

// 1. Sign up.
await page.goto(`${BASE_URL}/sign-up`);
await page.getByLabel("Email").fill(EMAIL);
await page.getByLabel("Password").fill(PASSWORD);
await shot(page, "01-sign-up");
await page.getByRole("button", { name: "Create account" }).click();
await page.getByRole("heading", { name: "Check your inbox" }).waitFor();
await page.goto(await confirmationLink(EMAIL));
await page.waitForURL(/\/dashboard$/);
await page.getByText("No audits yet").waitFor();
await shot(page, "02-empty-dashboard");

// 2. Describe the job.
await page.goto(`${BASE_URL}/employments/new`);
await page.getByLabel("Name").fill("Corner store (casual)");
await shot(page, "03-add-employment");
await page.getByRole("button", { name: "Save employment" }).click();
await page.getByRole("heading", { name: "Corner store (casual)", level: 1 }).waitFor();

// 3. Import the timesheet.
await page.goto(`${BASE_URL}/shifts/import`);
await page
  .getByLabel("CSV file")
  .setInputFiles({ name: "timesheet.csv", mimeType: "text/csv", buffer: Buffer.from(TIMESHEET) });
await shot(page, "04-import-csv");
await page.getByRole("button", { name: "Import shifts" }).click();
await page.waitForURL(/\/shifts\?employmentId=/);
await shot(page, "05-imported-shifts");

// 4. Enter the payslip: $800.00 for a fortnight whose award minimum is $862.15.
await page.goto(`${BASE_URL}/payslips/new`);
await page.getByLabel("Pay period start").fill("2026-07-06");
await page.getByLabel("Pay period end").fill("2026-07-19");
await page.getByLabel("Gross pay ($)").fill("800.00");
await shot(page, "06-payslip");
await page.getByRole("button", { name: "Save payslip and continue" }).click();
await page.waitForURL(/\/audits\/new\?/);
await shot(page, "07-run-audit");

// 5. Run the audit and read the result.
await page.getByRole("button", { name: "Run audit" }).click();
await page.waitForURL(/\/audits\/[0-9a-f-]{36}$/);
await page.getByRole("heading", { name: "Potential underpayment" }).waitFor();
await shot(page, "08-audit-result");

// 6. See exactly how it was calculated.
await page.getByRole("link", { name: "How this was calculated" }).click();
await page.getByRole("heading", { name: "Calculation steps" }).waitFor();
await shot(page, "09-explanation");

// 7. Download the evidence report.
await page.getByRole("link", { name: "Back to audit" }).click();
const download = page.waitForEvent("download");
await page.getByRole("link", { name: "Download PDF report" }).click();
const pdf = await download;
const saved = path.join(OUT, "audit-report.pdf");
await pdf.saveAs(saved);
console.log(`saved ${pdf.suggestedFilename()} as audit-report.pdf (${(await stat(saved)).size} bytes)`);

await browser.close();
console.log(`Walkthrough recorded as ${EMAIL} (synthetic account; password not stored).`);
