import type { AwardRuleSet } from "@wageguard/award-rules";
import { EmploymentType, type EmploymentTerms } from "@wageguard/domain";

import { issue, type CalculationIssue } from "./issues.js";

/**
 * Employment-level eligibility. Returns every reason the pay period cannot be calculated
 * definitively. Declarations the user is unsure about become REVIEW_REQUIRED, never assumptions.
 */
export function scopeIssues(employment: EmploymentTerms, ruleSet: AwardRuleSet): CalculationIssue[] {
  const issues: CalculationIssue[] = [];
  const { declarations } = employment;
  const scope = ruleSet.supportedScope;

  if (employment.awardCode !== ruleSet.awardCode) {
    issues.push(issue("AWARD_NOT_SUPPORTED", `Award ${employment.awardCode} is not supported.`));
  }
  if (!scope.classifications.includes(employment.classificationCode)) {
    issues.push(
      issue(
        "CLASSIFICATION_NOT_SUPPORTED",
        `Classification ${employment.classificationCode} is not supported.`,
        {
          clauseRefs: ["17.1"],
        },
      ),
    );
  }
  if (!scope.employmentTypes.includes(employment.employmentType)) {
    issues.push(
      issue(
        "EMPLOYMENT_TYPE_NOT_SUPPORTED",
        `Employment type ${employment.employmentType} is not supported.`,
      ),
    );
  }
  if (!employment.timeZone.id.startsWith(scope.timeZonePrefix)) {
    issues.push(
      issue("TIME_ZONE_NOT_SUPPORTED", `Time zone ${employment.timeZone.id} is not an Australian time zone.`),
    );
  }

  if (declarations.enterpriseAgreement === "APPLIES") {
    issues.push(
      issue("ENTERPRISE_AGREEMENT_APPLIES", "An enterprise agreement applies instead of the award."),
    );
  } else if (declarations.enterpriseAgreement === "UNSURE") {
    issues.push(
      issue(
        "ENTERPRISE_AGREEMENT_UNCONFIRMED",
        "It is not confirmed whether an enterprise agreement applies.",
      ),
    );
  }
  if (declarations.awardCoverage === "UNSURE") {
    issues.push(
      issue("AWARD_COVERAGE_UNCONFIRMED", "Coverage by MA000004 has not been confirmed.", {
        clauseRefs: ["4"],
      }),
    );
  }
  const juniorsModelled = ruleSet.juniorRates !== undefined;
  if (declarations.ageBand === "UNDER_21" && !juniorsModelled) {
    issues.push(
      issue("JUNIOR_RATES_NOT_SUPPORTED", "Junior rates apply under 21 years of age.", {
        clauseRefs: ["17.2"],
      }),
    );
  } else if (declarations.ageBand === "UNDER_21" && employment.dateOfBirth === null) {
    issues.push(
      issue("DATE_OF_BIRTH_MISSING", "A date of birth is needed to apply junior rates.", {
        clauseRefs: ["17.2"],
      }),
    );
  } else if (declarations.ageBand === "UNSURE" && (employment.dateOfBirth === null || !juniorsModelled)) {
    issues.push(
      issue("AGE_UNCONFIRMED", "It is not confirmed that adult rates applied for the whole period.", {
        clauseRefs: ["2"],
      }),
    );
  }
  if (employment.apprentice) {
    issues.push(
      issue("APPRENTICE_NOT_SUPPORTED", "Apprentice and trainee rates are not calculated.", {
        clauseRefs: ["12", "17.3", "17.4", "17.7"],
      }),
    );
  }
  if (declarations.shiftworker === "YES" && ruleSet.supportedScope.shiftwork !== true) {
    issues.push(
      issue("SHIFTWORKER_NOT_SUPPORTED", "Shiftworker rates are not supported.", {
        clauseRefs: ["23", "25"],
      }),
    );
  } else if (declarations.shiftworker === "YES" && employment.bakingProduction) {
    issues.push(
      issue("BAKING_PRODUCTION_NOT_SUPPORTED", "Baking production shift rates are not calculated.", {
        clauseRefs: ["24.2", "25.2"],
      }),
    );
  } else if (declarations.shiftworker === "UNSURE") {
    issues.push(
      issue("SHIFTWORKER_STATUS_UNCONFIRMED", "Shiftworker status is not confirmed.", { clauseRefs: ["23"] }),
    );
  }

  if (
    employment.employmentType === EmploymentType.PART_TIME &&
    employment.partTimeGuaranteedMinutes === null
  ) {
    issues.push(
      issue("PART_TIME_GUARANTEED_HOURS_MISSING", "Part-time guaranteed hours were not provided.", {
        clauseRefs: ["10.5"],
      }),
    );
  }
  return issues;
}

/** Whether the rule set's windows can classify this employment's time at all. */
export function canClassify(employment: EmploymentTerms, ruleSet: AwardRuleSet): boolean {
  return (
    employment.awardCode === ruleSet.awardCode &&
    ruleSet.supportedScope.classifications.includes(employment.classificationCode) &&
    ruleSet.supportedScope.employmentTypes.includes(employment.employmentType)
  );
}
