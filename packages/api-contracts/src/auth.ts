import { z } from "zod";

import { IdSchema, InstantSchema } from "./common.js";

/** OWASP ASVS 2.1: minimum 12 characters, allow long passphrases, no composition rules. */
const PasswordSchema = z.string().min(12, "Use at least 12 characters").max(128);
/** Trimmed and lower-cased before validation, so pasted addresses with stray spaces are accepted. */
const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const RegisterRequestSchema = z.strictObject({ email: EmailSchema, password: PasswordSchema });
export const LoginRequestSchema = z.strictObject({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});
export const DeleteAccountRequestSchema = z.strictObject({ password: z.string().min(1).max(128) });

export const MeResponseSchema = z.strictObject({ id: IdSchema, email: z.string(), createdAt: InstantSchema });

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
