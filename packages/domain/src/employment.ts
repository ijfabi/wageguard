import { DomainError, DomainErrorCode } from "./errors.js";
import { WEEKDAYS, type Weekday } from "./time/local-date.js";
import type { TimeZone } from "./time/time-zone.js";

export const EmploymentType = {
  CASUAL: "CASUAL",
  PART_TIME: "PART_TIME",
  FULL_TIME: "FULL_TIME",
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

/**
 * Facts the user declares about their employment. WageGuard never infers coverage from a job title;
 * anything not positively confirmed leads to REVIEW_REQUIRED or UNSUPPORTED_SCENARIO downstream.
 */
export interface EmploymentDeclarations {
  /** Has the user confirmed the modern award (not a different instrument) covers this job? */
  readonly awardCoverage: "CONFIRMED" | "UNSURE";
  /** An enterprise agreement replaces the award's terms; WageGuard does not model agreements. */
  readonly enterpriseAgreement: "NONE" | "APPLIES" | "UNSURE";
  /** Adult rates apply from age 21 (MA000004 cl. 2 "adult employee"). Must hold for the whole period. */
  readonly ageBand: "ADULT_21_PLUS" | "UNDER_21" | "UNSURE";
  /** Employed specifically to do shiftwork (MA000004 Part 6)? */
  readonly shiftworker: "NO" | "YES" | "UNSURE";
}

export interface EmploymentTerms {
  readonly employmentId: string;
  readonly awardCode: string;
  readonly classificationCode: string;
  readonly employmentType: EmploymentType;
  readonly timeZone: TimeZone;
  readonly declarations: EmploymentDeclarations;
  /**
   * Part-time only: guaranteed hours per weekday agreed in writing (MA000004 cl. 10.5(a)), in
   * minutes. A weekday absent from the map means no guaranteed hours on that day.
   */
  readonly partTimeGuaranteedMinutes: ReadonlyMap<Weekday, number> | null;
}

const MAX_GUARANTEED_MINUTES_PER_DAY = 24 * 60;

export function createEmploymentTerms(terms: EmploymentTerms): EmploymentTerms {
  if (terms.employmentId.trim() === "") {
    throw new DomainError(DomainErrorCode.INVALID_EMPLOYMENT, "employmentId is required", "employmentId");
  }
  if (terms.partTimeGuaranteedMinutes !== null) {
    if (terms.employmentType !== EmploymentType.PART_TIME) {
      throw new DomainError(
        DomainErrorCode.INVALID_EMPLOYMENT,
        "Guaranteed hours only apply to part-time employment",
        "partTimeGuaranteedMinutes",
      );
    }
    for (const [day, minutes] of terms.partTimeGuaranteedMinutes) {
      if (
        !WEEKDAYS.includes(day) ||
        !Number.isInteger(minutes) ||
        minutes < 0 ||
        minutes > MAX_GUARANTEED_MINUTES_PER_DAY
      ) {
        throw new DomainError(
          DomainErrorCode.INVALID_EMPLOYMENT,
          `Guaranteed minutes for ${day} must be an integer between 0 and ${MAX_GUARANTEED_MINUTES_PER_DAY}`,
          `partTimeGuaranteedMinutes.${day}`,
        );
      }
    }
  }
  return Object.freeze({ ...terms });
}
