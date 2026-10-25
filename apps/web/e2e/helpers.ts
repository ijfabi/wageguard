import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

import { emailedLink } from "./outbox";

export const PASSWORD = "correct horse battery staple";

/**
 * Registers a fresh synthetic user through the UI, opens the confirmation link from the email the
 * API wrote to the outbox, and lands on the dashboard.
 */
export async function signUp(page: Page): Promise<string> {
  const email = `e2e-${randomUUID()}@example.test`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await page.goto(await emailedLink(email, "verify-email"));
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  return email;
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

/** Creates a casual Level 1 employment in Sydney through the UI. */
export async function addCasualEmployment(page: Page, label: string): Promise<void> {
  await page.goto("/employments");
  await page.getByRole("link", { name: "Add employment" }).first().click();
  await page.getByLabel("Name").fill(label);
  await page.getByRole("button", { name: "Save employment" }).click();
  await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
}

/** Golden scenario G009: Monday, Saturday and Sunday shifts worth $862.15 at casual Level 1 rates. */
export const G009_CSV = [
  "start,end,meal_start,meal_end",
  "2026-07-06T09:00,2026-07-06T17:00,2026-07-06T12:00,2026-07-06T12:30",
  "2026-07-11T08:00,2026-07-11T16:30,2026-07-11T12:00,2026-07-11T12:30",
  "2026-07-12T10:00,2026-07-12T16:00,2026-07-12T13:00,2026-07-12T13:30",
  "",
].join("\n");

export async function importCsv(page: Page, csv: string): Promise<void> {
  await page.goto("/shifts/import");
  await page
    .getByLabel("CSV file")
    .setInputFiles({ name: "timesheet.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Import shifts" }).click();
}

export async function enterPayslip(page: Page, gross: string): Promise<void> {
  await page.goto("/payslips/new");
  await page.getByLabel("Pay period start").fill("2026-07-06");
  await page.getByLabel("Pay period end").fill("2026-07-19");
  await page.getByLabel("Gross pay ($)").fill(gross);
  await page.getByRole("button", { name: "Save payslip and continue" }).click();
  await expect(page).toHaveURL(/\/audits\/new\?/);
}
