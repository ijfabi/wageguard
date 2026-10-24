import type {
  AuditDetail,
  AuditLines,
  AuditReport,
  AuditSummary,
  PayslipResponse,
} from "@wageguard/api-contracts";
import type {
  AuditFinding,
  PayPeriodCalculationResult,
  ReconciliationResult,
} from "@wageguard/calculation-engine";

import type { Audit } from "../../generated/prisma/client.js";
import { decimalString } from "../payslips/payslips.service.js";
import { fromDateColumn } from "../shifts/shift-times.js";
import type { AuditPdfInput } from "./audit-pdf.js";
import type { AuditDetailRow, AuditResultRow, AuditSummaryRow } from "./audit.repository.js";

export const REPORT_DISCLAIMER =
  "WageGuard is an informational tool, not legal advice. Award rates were transcribed from the official " +
  "award and cross-checked by automated tests but have not been reviewed by a qualified payroll or legal " +
  "professional. Results marked REVIEW_REQUIRED or UNSUPPORTED_SCENARIO are not verified discrepancies.";

/** JSON columns written by this service; typed by the engine package that produced them. */
const result = (audit: Pick<Audit, "result">): PayPeriodCalculationResult =>
  audit.result as unknown as PayPeriodCalculationResult;
const reconciliation = (audit: Pick<Audit, "reconciliation">): ReconciliationResult =>
  audit.reconciliation as unknown as ReconciliationResult;

export function toAuditSummary(audit: AuditSummaryRow): AuditSummary {
  return {
    id: audit.id,
    employmentId: audit.employmentId,
    payslipId: audit.payslipId,
    status: audit.status,
    payPeriod: { startDate: fromDateColumn(audit.periodStart), endDate: fromDateColumn(audit.periodEnd) },
    findingStatus: audit.findingStatus,
    calculationStatus: audit.calculationStatus,
    expectedAmount: audit.expectedAmount === null ? null : decimalString(audit.expectedAmount),
    reportedAmount: decimalString(audit.reportedAmount),
    difference: audit.difference === null ? null : decimalString(audit.difference),
    shiftCount: audit.shiftCount,
    ruleSetVersion: audit.ruleSetVersion,
    engineVersion: audit.engineVersion,
    createdAt: audit.createdAt.toISOString(),
  };
}

export function toAuditDetail(audit: AuditDetailRow): AuditDetail {
  const rec = reconciliation(audit);
  return {
    ...toAuditSummary(audit),
    ruleSetFingerprint: audit.ruleSetFingerprint,
    inputHash: audit.inputHash,
    calculatedAt: audit.calculatedAt.toISOString(),
    comparisonBasis: rec.comparisonBasis,
    roundingTolerance: rec.roundingTolerance,
    notes: [...rec.notes],
    findings: [...rec.findings] as AuditFinding[],
    assumptions: [...result(audit).assumptions],
  };
}

export function toAuditLines(audit: AuditResultRow): AuditLines {
  const calc = result(audit);
  return { auditId: audit.id, lines: [...calc.lines], shifts: [...calc.shifts] };
}

export function toAuditPdfInput(audit: Audit, generatedAt: string): AuditPdfInput {
  return {
    audit: toAuditDetail(audit),
    calculation: result(audit),
    payslip: audit.payslipSnapshot as unknown as PayslipResponse,
    generatedAt,
    disclaimer: REPORT_DISCLAIMER,
  };
}

export function toAuditReport(audit: Audit, generatedAt: string): AuditReport {
  return {
    reportVersion: 1,
    generatedAt,
    audit: toAuditSummary(audit),
    input: audit.inputSnapshot,
    payslip: audit.payslipSnapshot,
    calculation: result(audit),
    reconciliation: reconciliation(audit),
    disclaimer: REPORT_DISCLAIMER,
  };
}
