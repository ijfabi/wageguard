import type {
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
  MeResponse,
  PayslipResponse,
  RegisterRequest,
  ShiftResponse,
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
}

/** Typed wrappers for every API route the UI uses. Types come from @wageguard/api-contracts. */
export const api = {
  register: (body: RegisterRequest) => apiRequest<MeResponse>("/auth/register", { method: "POST", body }),
  login: (body: LoginRequest) => apiRequest<MeResponse>("/auth/login", { method: "POST", body }),
  logout: () => apiRequest<undefined>("/auth/logout", { method: "POST" }),
  me: () => apiRequest<MeResponse>("/auth/me"),
  deleteAccount: (password: string) =>
    apiRequest<undefined>("/auth/me", { method: "DELETE", body: { password } }),

  dashboard: () => apiRequest<DashboardResponse>("/dashboard"),
  ruleVersions: () => apiRequest<{ items: RuleSetSummary[] }>("/rules/versions"),

  employments: () => apiRequest<Page<EmploymentResponse>>("/employments", { query: { limit: 100 } }),
  employment: (id: string) => apiRequest<EmploymentResponse>(`/employments/${encodeURIComponent(id)}`),
  createEmployment: (body: CreateEmploymentRequest) =>
    apiRequest<EmploymentResponse>("/employments", { method: "POST", body }),

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
