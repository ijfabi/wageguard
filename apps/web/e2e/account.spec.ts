import { createHmac } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { PASSWORD, addCasualEmployment, signOut, signUp } from "./helpers";
import { emailedLink } from "./outbox";

/** RFC 6238 code for a base32 secret at the current time (HMAC-SHA1, 6 digits, 30 seconds). */
function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/\s/g, "")) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac.readUInt8(mac.length - 1) & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("account security", () => {
  test("resets a forgotten password from the emailed link", async ({ page }) => {
    const email = await signUp(page);
    await signOut(page);
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

    await page.goto(await emailedLink(email, "reset-password"));
    // The token is taken out of the address bar as soon as the page reads it.
    await expect(page).toHaveURL(/\/reset-password$/);
    const newPassword = "a brand new passphrase";
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();

    await signIn(page, email);
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();
    await signIn(page, email, newPassword);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("turns on two-step verification and then needs a code to sign in", async ({ page }) => {
    const email = await signUp(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Turn on two-step verification" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Password").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(dialog.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
    const secret = (await dialog.locator(".select-all").innerText()).replace(/\s/g, "");
    await dialog.getByLabel("6-digit code").fill(totp(secret));
    await dialog.getByRole("button", { name: "Turn on" }).click();
    await expect(dialog.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
    const recovery = (
      await dialog.getByRole("list", { name: "Recovery codes" }).getByRole("listitem").first().innerText()
    ).trim();
    await dialog.getByRole("button", { name: /saved them/ }).click();
    await expect(page.getByText("On. Signing in needs a code")).toBeVisible();

    await signOut(page);
    await signIn(page, email);
    await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
    // The code used to turn it on can't be reused, so sign in with a recovery code.
    await page.getByRole("button", { name: "Lost your phone? Use a recovery code" }).click();
    await page.getByLabel("Recovery code").fill(recovery);
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test("edits an employment and shows the public holidays for the new state", async ({ page }) => {
  await signUp(page);
  await addCasualEmployment(page, "Seaside kiosk");
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("State or territory").selectOption("VIC");
  await expect(page.getByLabel("Time zone")).toHaveValue("Australia/Melbourne");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Victoria").first()).toBeVisible();

  // Melbourne Cup Day falls in this pay period. Some regional areas move it, so it is listed but
  // starts unticked: leaving out a holiday can only lower the calculated minimum.
  await page.goto("/payslips/new");
  await page.getByLabel("Pay period start").fill("2026-10-26");
  await page.getByLabel("Pay period end").fill("2026-11-08");
  await page.getByLabel("Gross pay ($)").fill("100.00");
  await page.getByRole("button", { name: "Save payslip and continue" }).click();
  const cup = page.getByRole("checkbox", { name: /Melbourne Cup/ });
  await expect(cup).not.toBeChecked();
  await cup.check();
  await expect(cup).toBeChecked();
});
