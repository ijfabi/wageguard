import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238 over RFC 4226 HOTP), with the parameters every
 * authenticator app supports: HMAC-SHA1, 6 digits, 30-second steps.
 */

export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
/** Accept the previous and next step too, for clock drift between the phone and the server. */
const DRIFT_STEPS = 1;
const SECRET_BYTES = 20;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32.charAt((value << (5 - bits)) & 31);
  }
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret(): Buffer {
  return randomBytes(SECRET_BYTES);
}

/** RFC 4226 section 5.3: dynamic truncation of HMAC-SHA1(secret, counter). */
export function hotp(secret: Uint8Array, counter: number, digits = DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(message).digest();
  const offset = mac.readUInt8(mac.length - 1) & 0x0f;
  const binary = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, "0");
}

export const stepAt = (epochMs: number) => Math.floor(epochMs / 1000 / TOTP_STEP_SECONDS);

/**
 * Returns the step the code matched, or null. Steps at or before `lastUsedStep` are refused, so a
 * code seen by someone looking over a shoulder can't be used again.
 */
export function verifyTotp(
  secret: Uint8Array,
  code: string,
  epochMs: number,
  lastUsedStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  const now = stepAt(epochMs);
  let matched: number | null = null;
  // Check every candidate rather than stopping early, so timing doesn't reveal which step matched.
  for (let step = now - DRIFT_STEPS; step <= now + DRIFT_STEPS; step++) {
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code)) && (lastUsedStep === null || step > lastUsedStep)) {
      matched ??= step;
    }
  }
  return matched;
}

export function otpauthUri(secret: Uint8Array, account: string, issuer = "WageGuard"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** AES-256-GCM with a random 96-bit nonce. Stored as "v1.<nonce>.<tag>.<ciphertext>", base64url parts. */
export function encryptSecret(key: Buffer, secret: Uint8Array): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ciphertext]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decryptSecret(key: Buffer, stored: string): Buffer {
  const [version, iv, tag, ciphertext] = stored.split(".");
  if (version !== "v1" || iv === undefined || tag === undefined || ciphertext === undefined) {
    throw new Error("Unrecognised two-factor secret format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
}

const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i

/** Ten codes like "k7qm-2xpd-9fne": 12 characters from 31, about 59 bits each. */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from(
      { length: 12 },
      () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
    ).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  });
}
