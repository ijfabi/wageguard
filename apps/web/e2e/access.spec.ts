import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { G009_CSV, addCasualEmployment, enterPayslip, importCsv, signOut, signUp } from "./helpers";

test.describe("access control", () => {
  test("signed-out visitors are sent to sign-in and returned afterwards", async ({ page }) => {
    await page.goto("/audits");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faudits$/);
  });

  test("the post-sign-in redirect cannot point to another site", async ({ page }) => {
    await signUp(page);
    await signOut(page);
    await page.goto("/sign-in?next=//evil.example/phish");
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\//);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("submitting the sign-in form never puts credentials in the URL", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByLabel("Password").fill("not-a-real-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForLoadState();
    expect(page.url()).not.toContain("password");
    expect(page.url()).not.toContain("nobody");
  });
});

test.describe("content security policy", () => {
  test("scripts need a per-request nonce, and the app runs without violations", async ({ page }) => {
    // Record every CSP violation the browser reports, on every document.
    await page.addInitScript(() => {
      const w = window as unknown as { cspViolations: string[] };
      w.cspViolations = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        w.cspViolations.push(
          `${e.violatedDirective} ${e.blockedURI} at ${e.sourceFile}:${e.lineNumber}:${e.columnNumber}`,
        );
      });
    });
    const violations = () =>
      page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);

    const nonceOf = (csp: string | undefined) =>
      /script-src 'self' 'nonce-([A-Za-z0-9+/=]+)' 'strict-dynamic'/.exec(csp ?? "")?.[1];
    const first = await page.goto("/sign-in");
    const csp = first?.headers()["content-security-policy"];
    const nonce = nonceOf(csp);
    expect(nonce, csp).toBeDefined();
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    // Browsers hide the nonce attribute after parsing; the property keeps it.
    const scriptNonces = await page
      .locator("script")
      .evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
    expect(scriptNonces.length).toBeGreaterThan(0);
    expect(new Set(scriptNonces)).toEqual(new Set([nonce]));
    const second = await page.goto("/sign-in");
    expect(nonceOf(second?.headers()["content-security-policy"])).not.toBe(nonce);
    expect(await violations()).toEqual([]);

    // Signing up needs client-side JavaScript, so this also proves the allowed scripts run.
    await signUp(page);
    // A fresh user has no employment yet, so this also covers each page's empty state.
    for (const path of ["/dashboard", "/shifts/import", "/payslips/new", "/audits/new", "/settings"]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      expect(await violations(), path).toEqual([]);
    }
  });
});

test.describe("accessibility panel", () => {
  test("applies display preferences straight away and keeps them after a reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Accessibility" }).click();
    const dialog = page.getByRole("dialog", { name: "Accessibility and display" });
    // The radios are visually hidden behind styled labels, so pick options the way a user does.
    const choose = async (group: string, option: string) => {
      const label = dialog
        .getByRole("group", { name: group })
        .locator("label")
        .filter({ hasText: new RegExp(`^${option}$`) });
      await label.click();
      await expect(label.getByRole("radio")).toBeChecked();
    };
    await choose("Theme", "Dark");
    await choose("Text size", "Larger");
    await choose("Motion", "Reduce motion");
    await choose("Contrast", "High contrast");

    const html = page.locator("html");
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(html).toHaveAttribute("data-text", "larger");
    await expect(html).toHaveAttribute("data-motion", "reduce");
    await expect(html).toHaveAttribute("data-contrast", "high");

    // Applied before the page paints on the next load (by the nonce-carrying inline script).
    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(html).toHaveAttribute("data-text", "larger");

    await page.getByRole("button", { name: "Accessibility" }).click();
    await page.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(html).not.toHaveAttribute("data-text", /.+/);
    await expect(html).not.toHaveAttribute("data-contrast", /.+/);
  });

  test("moving homepage content can be paused, and stops entirely with reduced motion", async ({ page }) => {
    await page.goto("/");
    const pauseDemo = page.getByRole("button", { name: "Pause animation" });
    await pauseDemo.click();
    await expect(page.getByRole("button", { name: "Play animation" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Pause quotes" }).click();
    await expect(page.getByRole("button", { name: "Play quotes" })).toBeVisible();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.getByRole("button", { name: /animation|quotes/ })).toHaveCount(0);
    // The quotes are still all there, as a static list.
    await expect(page.locator("#award blockquote").first()).toBeVisible();
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
    // Eleven server-rendered page states with a full axe scan each (about 33 s measured locally).
    test.setTimeout(90_000);
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

  test("the homepage and app pages pass in dark, high-contrast and large-text modes", async ({ page }) => {
    test.setTimeout(90_000);
    for (const prefs of [
      { theme: "dark", textSize: "standard", motion: "system", contrast: "standard" },
      { theme: "light", textSize: "larger", motion: "reduce", contrast: "high" },
      { theme: "dark", textSize: "large", motion: "reduce", contrast: "high" },
    ]) {
      await page.addInitScript((value) => {
        localStorage.setItem("wg-display", value);
      }, JSON.stringify(prefs));
      await page.goto("/");
      await expectAccessible(page);
    }
    await signUp(page);
    await expectAccessible(page);
    await page.goto("/settings");
    await expect(page.locator("main h1")).toBeVisible();
    await expectAccessible(page);
  });

  test("every page reflows at 320 CSS pixels with the largest text (WCAG 1.4.10)", async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      localStorage.setItem(
        "wg-display",
        JSON.stringify({ theme: "system", textSize: "larger", motion: "reduce", contrast: "standard" }),
      );
    });
    await page.setViewportSize({ width: 320, height: 640 });
    // Nothing may push the page sideways. Wide tables may scroll inside their own container.
    const expectNoSidewaysScroll = async () => {
      await expect(page.locator("main h1")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, page.url()).toBeLessThanOrEqual(0);
    };
    for (const path of ["/", "/sign-in", "/sign-up"]) {
      await page.goto(path);
      await expectNoSidewaysScroll();
    }
    await signUp(page);
    await addCasualEmployment(page, "Narrow screen store");
    await importCsv(page, G009_CSV);
    await expect(page).toHaveURL(/\/shifts\?/);
    await enterPayslip(page, "800.00");
    await page.getByRole("button", { name: "Run audit" }).click();
    await expect(page.getByRole("heading", { name: "Potential underpayment" })).toBeVisible();
    const audit = page.url();
    for (const path of [
      audit,
      `${audit}/explanation`,
      "/dashboard",
      "/employments",
      "/shifts",
      "/shifts/new",
      "/shifts/import",
      "/payslips",
      "/payslips/new",
      "/audits",
      "/audits/new",
      "/settings",
    ]) {
      await page.goto(path);
      await expectNoSidewaysScroll();
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
