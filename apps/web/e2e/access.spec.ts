import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { G009_CSV, addCasualEmployment, enterPayslip, importCsv, signUp } from "./helpers";

test.describe("access control", () => {
  test("signed-out visitors are sent to sign-in and returned afterwards", async ({ page }) => {
    await page.goto("/audits");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faudits$/);
  });

  test("the post-sign-in redirect cannot point to another site", async ({ page }) => {
    await signUp(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/sign-in?next=//evil.example/phish");
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\//);
  });
});

/** Fails on any WCAG 2.1 A/AA violation that axe rates serious or critical. */
async function expectAccessible(page: Page) {
  // Measure what users see: wait until any toast has finished its fade-in animation.
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-sonner-toast]")].every((t) => getComputedStyle(t).opacity === "1"),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    blocking.map(
      (v) => `${page.url()} ${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
    ),
  ).toEqual([]);
}

test.describe("accessibility (axe, WCAG 2.1 AA)", () => {
  test("public pages", async ({ page }) => {
    for (const path of ["/", "/sign-in", "/sign-up"]) {
      await page.goto(path);
      await expectAccessible(page);
    }
  });

  test("signed-in pages, including an audit", async ({ page }) => {
    await signUp(page);
    await expectAccessible(page);
    await addCasualEmployment(page, "Accessible store");
    await expectAccessible(page);
    await importCsv(page, G009_CSV);
    await expect(page).toHaveURL(/\/shifts\?/);
    await expectAccessible(page);
    await enterPayslip(page, "862.15");
    await expectAccessible(page);
    await page.getByRole("button", { name: "Run audit" }).click();
    await expect(page.getByRole("heading", { name: "Matches calculated minimum" })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: "How this was calculated" }).click();
    await expect(page.getByRole("heading", { name: "Calculation steps" })).toBeVisible();
    await expectAccessible(page);
    for (const path of ["/dashboard", "/payslips", "/audits", "/settings", "/shifts/new"]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      await expectAccessible(page);
    }
  });

  test("keyboard users can skip to the main content", async ({ page }) => {
    await signUp(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});
