/**
 * Captures README screenshots from a running stack, signed in as a seeded synthetic demo account.
 *
 *   DEMO_EMAIL=... DEMO_PASSWORD=... pnpm --filter @wageguard/web screenshots
 *
 * Seed the account first with `pnpm --filter @wageguard/api seed:demo`.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium, type Page } from "@playwright/test";

const BASE_URL = process.env["WEB_URL"] ?? "http://localhost:3000";
const EMAIL = process.env["DEMO_EMAIL"];
const PASSWORD = process.env["DEMO_PASSWORD"];
const OUT = path.resolve(import.meta.dirname, "..", "..", "..", "docs", "screenshots");

if (EMAIL === undefined || PASSWORD === undefined) {
  console.error("Set DEMO_EMAIL and DEMO_PASSWORD for a seeded demo account.");
  process.exit(1);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0); // no stray hover states (tooltips) in the capture
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`saved ${name}.png`);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  colorScheme: "light",
  reducedMotion: "reduce",
});

await page.goto(`${BASE_URL}/`);
await shot(page, "01-landing");

// The homepage's first screen, and the accessibility panel open over it.
await page.setViewportSize({ width: 1440, height: 900 });
await page.screenshot({ path: path.join(OUT, "00-homepage-hero.png") });
console.log("saved 00-homepage-hero.png");
await page.getByRole("button", { name: "Accessibility" }).click();
await page.getByRole("dialog", { name: "Accessibility and display" }).waitFor();
await page.screenshot({ path: path.join(OUT, "07-accessibility-panel.png") });
console.log("saved 07-accessibility-panel.png");
await page.keyboard.press("Escape");
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto(`${BASE_URL}/sign-in`);
await page.getByLabel("Email").fill(EMAIL);
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(/\/dashboard$/);
await page.getByText("Audits run", { exact: true }).waitFor();
await shot(page, "02-dashboard");

await page.goto(`${BASE_URL}/audits?status=POTENTIAL_UNDERPAYMENT`);
await page.getByRole("table", { name: "Audit history" }).getByRole("link").first().click();
await page.getByRole("heading", { name: "Potential underpayment" }).waitFor();
await shot(page, "03-audit-underpayment");

await page.getByRole("link", { name: "How this was calculated" }).click();
await page.getByRole("heading", { name: "Calculation steps" }).waitFor();
await shot(page, "04-calculation-explanation");

await page.goto(`${BASE_URL}/audits?status=REVIEW_REQUIRED`);
await page.getByRole("table", { name: "Audit history" }).getByRole("link").first().click();
await page.getByRole("heading", { name: "Needs review" }).waitFor();
await shot(page, "05-audit-needs-review");

await page.goto(`${BASE_URL}/shifts`);
await page.getByRole("table", { name: "Recorded shifts" }).waitFor();
await shot(page, "06-shifts");

await browser.close();
