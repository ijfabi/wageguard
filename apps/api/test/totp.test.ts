import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/config.js";
import { describeDevice } from "../src/modules/identity/session.service.js";
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hotp,
  verifyTotp,
} from "../src/modules/identity/totp.js";

/** RFC 6238 appendix B uses the ASCII secret "12345678901234567890" for SHA-1. */
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");

describe("TOTP", () => {
  it("matches the RFC 4226 HOTP test values", () => {
    const expected = [
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489",
    ];
    expect(expected.map((_, counter) => hotp(RFC_SECRET, counter))).toEqual(expected);
  });

  it("matches the RFC 6238 SHA-1 test values (8 digits)", () => {
    const cases: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    for (const [seconds, code] of cases) {
      expect(hotp(RFC_SECRET, Math.floor(seconds / 30), 8), String(seconds)).toBe(code);
    }
  });

  it("accepts the neighbouring steps for clock drift, and nothing further", () => {
    const at = 1_234_567_890_000;
    const step = Math.floor(at / 30_000);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), at, null)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), at, null)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), at, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", at, null)).toBeNull();
  });

  it("refuses steps at or before the last one used", () => {
    const at = 1_234_567_890_000;
    const step = Math.floor(at / 30_000);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), at, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), at, step - 1)).toBe(step);
  });

  it("round-trips base32 (RFC 4648 test vectors)", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Encode(Buffer.from("fo"))).toBe("MZXQ");
    expect(base32Decode("mzxw 6ytb oi======").toString()).toBe("foobar");
    expect(() => base32Decode("MZ1")).toThrow();
  });

  it("encrypts secrets with authentication, so a changed byte is detected", () => {
    const key = Buffer.alloc(32, 7);
    const stored = encryptSecret(key, RFC_SECRET);
    expect(stored).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(encryptSecret(key, RFC_SECRET)).not.toBe(stored); // fresh nonce each time
    expect(decryptSecret(key, stored)).toEqual(RFC_SECRET);
    const parts = stored.split(".");
    const flipped = Buffer.from(parts[3]!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    parts[3] = flipped.toString("base64url");
    expect(() => decryptSecret(key, parts.join("."))).toThrow();
    expect(() => decryptSecret(Buffer.alloc(32, 8), stored)).toThrow();
  });

  it("makes ten distinct recovery codes without look-alike characters", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
    }
  });
});

describe("device names", () => {
  it("keeps only the browser and platform", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      ),
    ).toBe("Edge on Windows");
    expect(describeDevice("Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0")).toBe(
      "Firefox on Linux",
    );
    expect(describeDevice("curl/8.9.1")).toBe("Unknown device");
    expect(describeDevice(undefined)).toBeNull();
  });
});

describe("mail and two-factor configuration", () => {
  const base = { DATABASE_URL: "postgresql://x@localhost/db" };

  it("uses the outbox outside production and links to the first allowed origin", () => {
    const config = loadConfig({ ...base, ALLOWED_ORIGINS: "https://app.example/, https://b.example" });
    expect(config.mail.transport).toBe("outbox");
    expect(config.appBaseUrl).toBe("https://app.example");
    expect(config.totpEncryptionKey).toBeNull();
  });

  it("requires SMTP in production and refuses the outbox there", () => {
    const production = { ...base, NODE_ENV: "production", COOKIE_SECURE: "true" };
    expect(() => loadConfig(production)).toThrow(/SMTP_URL and MAIL_FROM/);
    expect(() => loadConfig({ ...production, MAIL_TRANSPORT: "outbox" })).toThrow(
      /not allowed in production/,
    );
    const config = loadConfig({
      ...production,
      SMTP_URL: "smtps://user:pass@smtp.example:465",
      MAIL_FROM: "WageGuard <no-reply@example.com>",
    });
    expect(config.mail).toMatchObject({ transport: "smtp", from: "WageGuard <no-reply@example.com>" });
  });

  it("validates the two-factor key length and treats an empty value as unset", () => {
    expect(() => loadConfig({ ...base, TOTP_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(
      /32 bytes/,
    );
    expect(loadConfig({ ...base, TOTP_ENCRYPTION_KEY: "" }).totpEncryptionKey).toBeNull();
    expect(
      loadConfig({ ...base, TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64") }).totpEncryptionKey,
    ).toHaveLength(32);
  });
});
