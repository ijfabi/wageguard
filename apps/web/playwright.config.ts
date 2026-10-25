import { defineConfig, devices } from "@playwright/test";

import { MAIL_OUTBOX_DIR } from "./e2e/outbox";

/**
 * End-to-end tests against the real stack: the compiled API (apps/api/dist) on :3001 with a real
 * PostgreSQL (DATABASE_URL, migrated), and the production web build (`next start`) on :3000.
 * Build first: `pnpm build && pnpm --filter @wageguard/web build`.
 */
const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://wageguard:wageguard-local-only@127.0.0.1:5432/wageguard";
const CI = process.env["CI"] !== undefined;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node ../api/dist/main.js",
      url: "http://127.0.0.1:3001/api/v1/ready",
      reuseExistingServer: !CI,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        DATABASE_URL,
        PORT: "3001",
        ALLOWED_ORIGINS: "http://localhost:3000",
        LOG_LEVEL: "warn",
        // Many sign-ups from one IP during the suite; production limits are tested in the API suite.
        AUTH_RATE_LIMIT_PER_MINUTE: "1000",
        RATE_LIMIT_PER_MINUTE: "10000",
        // Emails are written to files the tests read, instead of being sent.
        MAIL_TRANSPORT: "outbox",
        MAIL_OUTBOX_DIR,
        APP_BASE_URL: "http://localhost:3000",
        // Test-only key (32 bytes of 0x02), so two-factor sign-in can be exercised.
        TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
      },
    },
    {
      command: "pnpm start",
      url: "http://localhost:3000",
      reuseExistingServer: !CI,
      timeout: 60_000,
      env: { API_ORIGIN: "http://127.0.0.1:3001" },
    },
  ],
});
