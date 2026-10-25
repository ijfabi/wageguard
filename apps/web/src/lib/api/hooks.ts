"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateAuditRequest,
  ListAuditsQuery,
  PublicHolidaysQuery,
  UpdateEmploymentRequest,
  UpdateShiftRequest,
} from "@wageguard/api-contracts";

import { api } from "./endpoints";

/** Query keys in one place, so invalidation after a mutation is consistent. */
export const keys = {
  me: ["me"] as const,
  dashboard: ["dashboard"] as const,
  rules: ["rules"] as const,
  employments: ["employments"] as const,
  employment: (id: string) => ["employments", id] as const,
  shifts: (filters: object) => ["shifts", filters] as const,
  payslips: (employmentId: string | undefined) => ["payslips", employmentId ?? "all"] as const,
  audits: (filters: object) => ["audits", filters] as const,
  audit: (id: string) => ["audit", id] as const,
  auditLines: (id: string) => ["audit", id, "lines"] as const,
  auditReport: (id: string) => ["audit", id, "report"] as const,
  sessions: ["sessions"] as const,
  publicHolidays: (query: PublicHolidaysQuery) => ["public-holidays", query] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.me, retry: false, staleTime: 60_000 });
export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: api.dashboard });
export const useRuleVersions = () =>
  useQuery({ queryKey: keys.rules, queryFn: api.ruleVersions, staleTime: Infinity });

export const useEmployments = () => useQuery({ queryKey: keys.employments, queryFn: api.employments });
export const useEmployment = (id: string) =>
  useQuery({ queryKey: keys.employment(id), queryFn: () => api.employment(id) });

export function useCreateEmployment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createEmployment,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.employments }),
  });
}

export function useUpdateEmployment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateEmploymentRequest) => api.updateEmployment(id, body),
    onSuccess: (updated) => {
      client.setQueryData(keys.employment(id), updated);
      return client.invalidateQueries({ queryKey: keys.employments });
    },
  });
}

export const useSessions = () => useQuery({ queryKey: keys.sessions, queryFn: api.sessions });

/** Public holidays for a state and date range. Reference data, so it is kept for the session. */
export const usePublicHolidays = (query: PublicHolidaysQuery | null) =>
  useQuery({
    queryKey: keys.publicHolidays(query ?? { state: "NSW", from: "", to: "" }),
    queryFn: () => api.publicHolidays(query as PublicHolidaysQuery),
    enabled: query !== null,
    staleTime: Infinity,
  });

export function useShifts(filters: { employmentId?: string; from?: string; to?: string }) {
  return useInfiniteQuery({
    queryKey: keys.shifts(filters),
    queryFn: ({ pageParam }) =>
      api.shifts({ ...filters, ...(pageParam === undefined ? {} : { cursor: pageParam }) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useCreateShift() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createShift,
    onSuccess: () => client.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

export function useUpdateShift() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateShiftRequest }) => api.updateShift(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

export function useImportShifts() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ employmentId, csv }: { employmentId: string; csv: string }) =>
      api.importShifts(employmentId, csv),
    onSuccess: () => client.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

export const usePayslips = (employmentId?: string) =>
  useQuery({
    queryKey: keys.payslips(employmentId),
    queryFn: () => api.payslips(employmentId === undefined ? {} : { employmentId }),
  });

export function useCreatePayslip() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createPayslip,
    onSuccess: () => client.invalidateQueries({ queryKey: ["payslips"] }),
  });
}

export function useAudits(filters: Partial<Pick<ListAuditsQuery, "findingStatus">>) {
  return useInfiniteQuery({
    queryKey: keys.audits(filters),
    queryFn: ({ pageParam }) =>
      api.audits({ ...filters, ...(pageParam === undefined ? {} : { cursor: pageParam }) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export const useAudit = (id: string) => useQuery({ queryKey: keys.audit(id), queryFn: () => api.audit(id) });
export const useAuditLines = (id: string) =>
  useQuery({ queryKey: keys.auditLines(id), queryFn: () => api.auditLines(id) });
export const useAuditReport = (id: string) =>
  useQuery({ queryKey: keys.auditReport(id), queryFn: () => api.auditReport(id), staleTime: Infinity });

export function useCreateAudit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreateAuditRequest; idempotencyKey: string }) =>
      api.createAudit(body, idempotencyKey),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["audits"] }),
        client.invalidateQueries({ queryKey: keys.dashboard }),
      ]);
    },
  });
}
