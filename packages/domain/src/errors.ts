/**
 * Stable, machine-readable error codes. Codes are part of the public contract (API error bodies,
 * calculation traces) and must not be renamed once released.
 */
export const DomainErrorCode = {
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_MONEY: "INVALID_MONEY",
  CURRENCY_MISMATCH: "CURRENCY_MISMATCH",
  INVALID_DECIMAL: "INVALID_DECIMAL",
  INVALID_LOCAL_DATE: "INVALID_LOCAL_DATE",
  INVALID_LOCAL_TIME: "INVALID_LOCAL_TIME",
  INVALID_LOCAL_DATE_TIME: "INVALID_LOCAL_DATE_TIME",
  INVALID_TIME_ZONE: "INVALID_TIME_ZONE",
  NONEXISTENT_LOCAL_TIME: "NONEXISTENT_LOCAL_TIME",
  AMBIGUOUS_LOCAL_TIME: "AMBIGUOUS_LOCAL_TIME",
  INVALID_UTC_OFFSET: "INVALID_UTC_OFFSET",
  INVALID_INTERVAL: "INVALID_INTERVAL",
  INVALID_SHIFT: "INVALID_SHIFT",
  INVALID_BREAK: "INVALID_BREAK",
  OVERLAPPING_SHIFTS: "OVERLAPPING_SHIFTS",
  INVALID_PAY_PERIOD: "INVALID_PAY_PERIOD",
  SHIFT_OUTSIDE_PAY_PERIOD: "SHIFT_OUTSIDE_PAY_PERIOD",
  INVALID_EMPLOYMENT: "INVALID_EMPLOYMENT",
  INVALID_PAYSLIP: "INVALID_PAYSLIP",
} as const;

export type DomainErrorCode = (typeof DomainErrorCode)[keyof typeof DomainErrorCode];

export interface DomainIssue {
  readonly code: DomainErrorCode;
  readonly message: string;
  /** Dotted path to the offending input field, e.g. `shifts[2].breaks[0].end`. */
  readonly path?: string;
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly path: string | undefined;

  constructor(code: DomainErrorCode, message: string, path?: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.path = path;
  }

  toIssue(): DomainIssue {
    return this.path === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, path: this.path };
  }
}

/** Raised when input validation finds one or more problems; carries every issue, not only the first. */
export class DomainValidationError extends Error {
  readonly issues: readonly DomainIssue[];

  constructor(issues: readonly DomainIssue[]) {
    super(`Validation failed with ${issues.length} issue(s): ${issues.map((i) => i.code).join(", ")}`);
    this.name = "DomainValidationError";
    this.issues = issues;
  }
}
