import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { G009_CSV, addCasualEmployment, enterPayslip, importCsv, signUp } from "./helpers";

test("a new user audits a payslip end to end and exports the report", async ({ page }) => {
  await signUp(page);
  await expect(page.getByText("No audits yet")).toBeVisible();

  await addCasualEmployment(page, "Corner store");

  await importCsv(page, G009_CSV);
  await expect(page).toHaveURL(/\/shifts\?employmentId=/);
  await expect(
    page.getByRole("cell", { name: "Mon 6 Jul 2026, 9:00 am – 5:00 pm", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Sun 12 Jul 2026, 10:00 am – 4:00 pm", exact: true }),
  ).toBeVisible();

  await enterPayslip(page, "862.15");
  await page.getByRole("button", { name: "Run audit" }).click();

  // Audit detail: matched, explained, never shown as a green "verified" pass.
  await expect(page).toHaveURL(/\/audits\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Matches calculated minimum" })).toBeVisible();
  await expect(page.getByText("$862.15").first()).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Pay lines" }).getByRole("cell", { name: "$333.76" }),
  ).toBeVisible(); // Saturday line
  await expect(page.getByText("MA000004/2026-07-01/r2").first()).toBeVisible();
  await expect(page.getByText(/not been reviewed by a payroll or legal professional/).first()).toBeVisible();

  // Full calculation explanation.
  await page.getByRole("link", { name: "How this was calculated" }).click();
  await expect(page.getByRole("heading", { name: "Calculation steps" })).toBeVisible();
  await expect(page.getByText("Ordinary hours on Saturday, 7.00 am to 6.00 pm").first()).toBeVisible();
  await page.getByRole("link", { name: "Back to audit" }).click();

  // Downloadable evidence: printable PDF and machine-readable JSON.
  const pdfPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF report" }).click();
  const pdf = await pdfPromise;
  expect(pdf.suggestedFilename()).toMatch(/^wageguard-audit-[0-9a-f-]{36}\.pdf$/);
  expect((await readFile(await pdf.path())).subarray(0, 5).toString("latin1")).toBe("%PDF-");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^wageguard-audit-[0-9a-f-]{36}\.json$/);
  const report = JSON.parse(await readFile(await download.path(), "utf8")) as {
    audit: { findingStatus: string };
    disclaimer: string;
  };
  expect(report.audit.findingStatus).toBe("MATCHED");
  expect(report.disclaimer).toMatch(/not legal advice/);

  // History and dashboard reflect the saved audit.
  await page.goto("/audits");
  await expect(page.getByRole("link", { name: "Mon 6 Jul 2026 – Sun 19 Jul 2026" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText("Shifts analysed")).toBeVisible();
  await expect(page.getByRole("table", { name: "Most recent audits" })).toBeVisible();
});

test("an underpaid payslip is reported as a potential underpayment with the difference", async ({ page }) => {
  await signUp(page);
  await addCasualEmployment(page, "Supermarket");
  await importCsv(page, G009_CSV);
  await enterPayslip(page, "800.00");
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page.getByRole("heading", { name: "Potential underpayment" })).toBeVisible();
  await expect(page.getByText("-$62.15")).toBeVisible();
});

test("a malformed CSV is rejected with the failing line and nothing is imported", async ({ page }) => {
  await signUp(page);
  await addCasualEmployment(page, "Bookshop");
  await importCsv(page, "start,end,meal_start,meal_end\n2026-07-06T09:00,not-a-time,,\n");
  const problems = page.getByRole("alert").filter({ hasText: "Nothing was imported" });
  await expect(problems).toContainText("line 2.end");
  await page.goto("/shifts");
  await expect(page.getByText("No shifts recorded")).toBeVisible();
});
