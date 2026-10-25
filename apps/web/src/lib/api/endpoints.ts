import type {
  AcceptedResponse,
  AuditDetail,
  AuditLines,
  AuditReport,
  AuditSummary,
  CreateAuditRequest,
  CreateEmploymentRequest,
  CreatePayslipRequest,
  CreateShiftRequest,
  DashboardResponse,
  EmploymentResponse,
  ImportShiftsResponse,
  ListAuditsQuery,
  LoginRequest,
  LoginResponse,
  MeResponse,
  PayslipResponse,
  PublicHolidaysQuery,
  PublicHolidaysResponse,
  RecoveryCodesResponse,
  RegisterRequest,
  SessionListResponse,
  ShiftResponse,
  TwoFactorSetupResponse,
  UpdateEmploymentRequest,
  UpdateShiftRequest,
} from "@wageguard/api-contracts";

import { apiRequest } from "./client";

export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

export interface RuleSetSummary {
  readonly version: string;
  readonly awardCode: string;
  readonly awardTitle: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly fingerprint: string;
  readonly sourceUrl: string;
  readonly enabledRuleCount: number;
  readonly disabledRuleCount: number;
  readonly supersededBy: string | null;
}

/** Typed wrappers for every API route the UI uses. Types come from @wageguard/api-contracts. */
export const api = {
  register: (body: RegisterRequest) =>
    apiRequest<AcceptedResponse>("/auth/register", { method: "POST", body }),
  verifyEmail: (token: string) =>
    apiRequest<MeResponse>("/auth/verify-email", { method: "POST", body: { token } }),
  resendVerification: (email: string) =>
    apiRequest<AcceptedResponse>("/auth/verify-email/resend", { method: "POST", body: { email } }),
  login: (body: LoginRequest) => apiRequest<LoginResponse>("/auth/login", { method: "POST", body }),
  loginTwoFactor: (code: string) =>
    apiRequest<MeResponse>("/auth/login/two-factor", { method: "POST", body: { code } }),
  requestPasswordReset: (email: string) =>
    apiRequest<AcceptedResponse>("/auth/password-reset", { method: "POST", body: { email } }),
  resetPassword: (token: string, password: string) =>
    apiRequest<undefined>("/auth/password-reset/confirm", { method: "POST", body: { token, password } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<undefined>("/auth/password", { method: "POST", body: { currentPassword, newPassword } }),
  logout: () => apiRequest<undefined>("/auth/logout", { method: "POST" }),
  me: () => apiRequest<MeResponse>("/auth/me"),
  deleteAccount: (password: string) =>
    apiRequest<undefined>("/auth/me", { method: "DELETE", body: { password } }),
  sessions: () => apiRequest<SessionListResponse>("/auth/sessions"),
  revokeSession: (id: string) =>
    apiRequest<undefined>(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  revokeOtherSessions: () => apiRequest<undefined>("/auth/sessions", { method: "DELETE" }),
  setupTwoFactor: (password: string) =>
    apiRequest<TwoFactorSetupResponse>("/auth/two-factor/setup", { method: "POST", body: { password } }),
  enableTwoFactor: (code: string) =>
    apiRequest<RecoveryCodesResponse>("/auth/two-factor/enable", { method: "POST", body: { code } }),
  disableTwoFactor: (password: string, code: string) =>
    apiRequest<undefined>("/auth/two-factor/disable", { method: "POST", body: { password, code } }),
  regenerateRecoveryCodes: (password: string, code: string) =>
    apiRequest<RecoveryCodesResponse>("/auth/two-factor/recovery-codes", {
      method: "POST",
      body: { password, code },
    }),
  publicHolidays: (query: PublicHolidaysQuery) =>
    apiRequest<PublicHolidaysResponse>("/public-holidays", { query: { ...query } }),

  dashboard: () => apiRequest<DashboardResponse>("/dashboard"),
  ruleVersions: () => apiRequest<{ items: RuleSetSummary[] }>("/rules/versions"),

  employments: () => apiRequest<Page<EmploymentResponse>>("/employments", { query: { limit: 100 } }),
  employment: (id: string) => apiRequest<EmploymentResponse>(`/employments/${encodeURIComponent(id)}`),
  createEmployment: (body: CreateEmploymentRequest) =>
    apiRequest<EmploymentResponse>("/employments", { method: "POST", body }),
  updateEmployment: (id: string, body: UpdateEmploymentRequest) =>
    apiRequest<EmploymentResponse>(`/employments/${encodeURIComponent(id)}`, { method: "PATCH", body }),

  shifts: (params: {
    employmentId?: string;
    from?: string;
    to?: string;
    cursor?: string;
    sort?: "start_asc" | "start_desc";
  }) => apiRequest<Page<ShiftResponse>>("/shifts", { query: { limit: 50, ...params } }),
  createShift: (body: CreateShiftRequest) => apiRequest<ShiftResponse>("/shifts", { method: "POST", body }),
  updateShift: (id: string, body: UpdateShiftRequest) =>
    apiRequest<ShiftResponse>(`/shifts/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  importShifts: (employmentId: string, csv: string) =>
    apiRequest<ImportShiftsResponse>("/shifts/import", {
      method: "POST",
      query: { employmentId },
      text: { content: csv, contentType: "text/csv" },
    }),

  payslips: (params: { employmentId?: string; cursor?: string }) =>
    apiRequest<Page<PayslipResponse>>("/payslips", { query: { limit: 50, ...params } }),
  payslip: (id: string) => apiRequest<PayslipResponse>(`/payslips/${encodeURIComponent(id)}`),
  createPayslip: (body: CreatePayslipRequest) =>
    apiRequest<PayslipResponse>("/payslips", { method: "POST", body }),

  audits: (params: Partial<Pick<ListAuditsQuery, "findingStatus" | "cursor">>) =>
    apiRequest<Page<AuditSummary>>("/audits", { query: { limit: 20, ...params } }),
  audit: (id: string) => apiRequest<AuditDetail>(`/audits/${encodeURIComponent(id)}`),
  auditLines: (id: string) => apiRequest<AuditLines>(`/audits/${encodeURIComponent(id)}/lines`),
  auditReport: (id: string) => apiRequest<AuditReport>(`/audits/${encodeURIComponent(id)}/report`),
  createAudit: (body: CreateAuditRequest, idempotencyKey: string) =>
    apiRequest<AuditDetail>("/audits", {
      method: "POST",
      body,
      headers: { "Idempotency-Key": idempotencyKey },
    }),
};
