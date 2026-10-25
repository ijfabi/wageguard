import { z } from "zod";

import { IdSchema, InstantSchema } from "./common.js";

/** OWASP ASVS 2.1: minimum 12 characters, allow long passphrases, no composition rules. */
const PasswordSchema = z.string().min(12, "Use at least 12 characters").max(128);
/** Trimmed and lower-cased before validation, so pasted addresses with stray spaces are accepted. */
const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
/** Email links carry 256 random bits, base64url-encoded. */
const EmailTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This link is not valid");
/** A 6-digit authenticator code, or a recovery code such as "k7qm-2xpd-9fne". Spaces are ignored. */
const TwoFactorCodeSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, "").toLowerCase())
  .pipe(z.string().regex(/^(\d{6}|[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/, "Enter the 6-digit code"));

export const RegisterRequestSchema = z.strictObject({ email: EmailSchema, password: PasswordSchema });
export const LoginRequestSchema = z.strictObject({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});
export const DeleteAccountRequestSchema = z.strictObject({ password: z.string().min(1).max(128) });

/** Requests that send an email. The response is the same whether or not the address has an account. */
export const EmailOnlyRequestSchema = z.strictObject({ email: EmailSchema });
export const VerifyEmailRequestSchema = z.strictObject({ token: EmailTokenSchema });
export const ResetPasswordRequestSchema = z.strictObject({
  token: EmailTokenSchema,
  password: PasswordSchema,
});
export const ChangePasswordRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: PasswordSchema,
});

export const TwoFactorLoginRequestSchema = z.strictObject({ code: TwoFactorCodeSchema });
export const TwoFactorSetupRequestSchema = z.strictObject({ password: z.string().min(1).max(128) });
export const TwoFactorEnableRequestSchema = z.strictObject({ code: TwoFactorCodeSchema });
export const TwoFactorConfirmRequestSchema = z.strictObject({
  password: z.string().min(1).max(128),
  code: TwoFactorCodeSchema,
});

export const MeResponseSchema = z.strictObject({
  id: IdSchema,
  email: z.string(),
  createdAt: InstantSchema,
  twoFactorEnabled: z.boolean(),
});

/** Sent for every request that might send an email, so the reply never reveals whether an account exists. */
export const AcceptedResponseSchema = z.strictObject({ status: z.literal("ACCEPTED"), message: z.string() });

export const LoginResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("SIGNED_IN"), me: MeResponseSchema }),
  /** The password was right; a code from the authenticator app is needed to finish signing in. */
  z.strictObject({ status: z.literal("TWO_FACTOR_REQUIRED") }),
]);

export const TwoFactorSetupResponseSchema = z.strictObject({
  /** Base32, for typing into an authenticator app by hand. */
  secret: z.string(),
  /** otpauth:// URI, for a QR code. */
  otpauthUri: z.string(),
});
export const RecoveryCodesResponseSchema = z.strictObject({
  /** Shown once. Each code works once, in place of an authenticator code. */
  recoveryCodes: z.array(z.string()),
});

export const SessionSummarySchema = z.strictObject({
  id: IdSchema,
  device: z.string().nullable(),
  createdAt: InstantSchema,
  lastSeenAt: InstantSchema,
  current: z.boolean(),
});
export const SessionListResponseSchema = z.strictObject({ items: z.array(SessionSummarySchema) });

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;
export type EmailOnlyRequest = z.infer<typeof EmailOnlyRequestSchema>;
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type TwoFactorLoginRequest = z.infer<typeof TwoFactorLoginRequestSchema>;
export type TwoFactorSetupRequest = z.infer<typeof TwoFactorSetupRequestSchema>;
export type TwoFactorEnableRequest = z.infer<typeof TwoFactorEnableRequestSchema>;
export type TwoFactorConfirmRequest = z.infer<typeof TwoFactorConfirmRequestSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
export type AcceptedResponse = z.infer<typeof AcceptedResponseSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type TwoFactorSetupResponse = z.infer<typeof TwoFactorSetupResponseSchema>;
export type RecoveryCodesResponse = z.infer<typeof RecoveryCodesResponseSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;
