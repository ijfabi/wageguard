import { DomainError, DomainErrorCode } from "./errors.js";
import { WEEKDAYS, type LocalDate, type Weekday } from "./time/local-date.js";
import type { TimeZone } from "./time/time-zone.js";

export const EmploymentType = {
  CASUAL: "CASUAL",
  PART_TIME: "PART_TIME",
  FULL_TIME: "FULL_TIME",
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

/** MA000004 cl. 15.2: where ordinary hours may be worked outside the standard span. */
export const SpanException = {
  NONE: "NONE",
  NEWSAGENCY: "NEWSAGENCY",
  VIDEO_SHOP: "VIDEO_SHOP",
  EXTENDED_TRADING: "EXTENDED_TRADING",
} as const;
export type SpanException = (typeof SpanException)[keyof typeof SpanException];

/**
 * Facts the user declares about their employment. WageGuard never infers coverage from a job title;
 * anything not positively confirmed leads to REVIEW_REQUIRED or UNSUPPORTED_SCENARIO downstream.
 */
export interface EmploymentDeclarations {
  /** Has the user confirmed the modern award (not a different instrument) covers this job? */
  readonly awardCoverage: "CONFIRMED" | "UNSURE";
  /** An enterprise agreement replaces the award's terms; WageGuard does not model agreements. */
  readonly enterpriseAgreement: "NONE" | "APPLIES" | "UNSURE";
  /** Adult rates apply from age 21 (MA000004 cl. 2 "adult employee"). */
  readonly ageBand: "ADULT_21_PLUS" | "UNDER_21" | "UNSURE";
  /** Employed specifically to do shiftwork (MA000004 Part 6)? */
  readonly shiftworker: "NO" | "YES" | "UNSURE";
}

/** Allowances whose conditions are facts about the job rather than about a pay period. */
export interface AllowanceDeclarations {
  /** cl. 19.3(c): launders special clothing the employer requires. */
  readonly laundersSpecialClothing: boolean;
  /** cl. 19.10: holds a first aid qualification and is appointed to perform first aid duty. */
  readonly appointedFirstAider: boolean;
  /** cl. 19.12: holds a liquor licence under State or Territory law. */
  readonly holdsLiquorLicence: boolean;
  /** cl. 19.13: works within the County of Yancowinna (Broken Hill). */
  readonly brokenHill: boolean;
}

export const NO_ALLOWANCES: AllowanceDeclarations = Object.freeze({
  laundersSpecialClothing: false,
  appointedFirstAider: false,
  holdsLiquorLicence: false,
  brokenHill: false,
});

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
  /** Needed for junior rates, which depend on the employee's age on each day worked (cl. 17.2). */
  readonly dateOfBirth: LocalDate | null;
  /** Needed for 20-year-olds, whose rate depends on time employed (cl. 17.2 Table 5). */
  readonly employmentStartDate: LocalDate | null;
  readonly spanException: SpanException;
  /** Casual full-time secondary school student (cl. 11.3). */
  readonly schoolStudent: boolean;
  /** cl. 16.6(d): a 10-hour break between work days has been agreed instead of 12. */
  readonly reducedBreakAgreed: boolean;
  /** Works to a roster averaging 38 hours over more than one week (cl. 15.6(g), Table 10). */
  readonly averagingRoster: boolean;
  /** Baking production employee (cl. 24.2, 25.2), not modelled. */
  readonly bakingProduction: boolean;
  /** Apprentice or trainee (cl. 12, 17.3 to 17.7), not modelled. */
  readonly apprentice: boolean;
  readonly allowances: AllowanceDeclarations;
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
  if (terms.schoolStudent && terms.employmentType !== EmploymentType.CASUAL) {
    throw new DomainError(
      DomainErrorCode.INVALID_EMPLOYMENT,
      "The school student engagement (cl. 11.3) only applies to casual employees",
      "schoolStudent",
    );
  }
  if (
    terms.dateOfBirth !== null &&
    terms.employmentStartDate !== null &&
    !terms.dateOfBirth.isBefore(terms.employmentStartDate)
  ) {
    throw new DomainError(
      DomainErrorCode.INVALID_EMPLOYMENT,
      "Employment must start after the date of birth",
      "employmentStartDate",
    );
  }
  return Object.freeze({ ...terms, allowances: Object.freeze({ ...terms.allowances }) });
}

/** Whole years of age on `date` (a birthday counts from the day itself; 29 February -> 1 March). */
export function ageOn(dateOfBirth: LocalDate, date: LocalDate): number {
  let age = date.year - dateOfBirth.year;
  const beforeBirthday =
    date.month < dateOfBirth.month || (date.month === dateOfBirth.month && date.day < dateOfBirth.day);
  if (beforeBirthday) {
    age -= 1;
  }
  return age;
}

/**
 * Whether more than six months of employment have passed by `date`: true from the day after the
 * same day of the month six months on (clamped to the month's last day).
 */
export function employedMoreThanSixMonths(start: LocalDate, date: LocalDate): boolean {
  const monthIndex = start.month - 1 + 6;
  const year = start.year + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const sixMonthsOn = Date.UTC(year, month - 1, Math.min(start.day, lastDay)) / 86_400_000;
  return date.toEpochDay() > sixMonthsOn;
}
