import type { AwardRuleSet, WeeklyWindowRule } from "@wageguard/award-rules";
import { Decimal, Money, type EmploymentType } from "@wageguard/domain";

const MINUTES_PER_HOUR = 60;
const PERCENT = 100;

export interface RatePricer {
  readonly baseHourlyRate: Money;
  /** Hourly rate for a rule, rounded per the rule set's hourly-rate policy. */
  hourlyRate(rule: WeeklyWindowRule): Money;
  /** Amount for `minutes` at `hourlyRate`, rounded once per the line-amount policy. */
  amount(hourlyRate: Money, minutes: number): Money;
}

/**
 * Builds the pricing functions for one classification and employment type.
 *
 * rate   = round(base x percent / 100)              -- reproduces Schedule B published rates
 * amount = round(rate x minutes / 60)               -- multiply before dividing: exact until the final round
 */
export function createPricer(
  ruleSet: AwardRuleSet,
  classificationCode: string,
  employmentType: EmploymentType,
): RatePricer {
  const classification = ruleSet.classifications.find((c) => c.code === classificationCode);
  if (classification === undefined) {
    throw new Error(`Classification ${classificationCode} missing from rule set ${ruleSet.version}`);
  }
  const baseHourlyRate = Money.of(classification.minimumHourlyRate);
  const { hourlyRate: ratePolicy, lineAmount: amountPolicy } = ruleSet.roundingPolicy;
  const cache = new Map<string, Money>();

  return {
    baseHourlyRate,
    hourlyRate(rule) {
      const cached = cache.get(rule.id);
      if (cached !== undefined) {
        return cached;
      }
      const percent = percentFor(rule, employmentType);
      const rate = Money.fromDecimal(
        baseHourlyRate.multiplyExact(new Decimal(percent).dividedBy(PERCENT)),
        ratePolicy.mode,
      );
      cache.set(rule.id, rate);
      return rate;
    },
    amount(hourlyRate, minutes) {
      return Money.fromDecimal(
        hourlyRate.multiplyExact(new Decimal(minutes)).dividedBy(MINUTES_PER_HOUR),
        amountPolicy.mode,
      );
    },
  };
}

export function percentFor(rule: WeeklyWindowRule, employmentType: EmploymentType): string {
  const percent = rule.percentOfMinimumHourlyRate[employmentType];
  if (percent === undefined) {
    throw new Error(`Rule ${rule.id} has no percentage for ${employmentType}`);
  }
  return percent;
}

/** Minutes as decimal hours to 4dp, for display only. */
export function minutesToHours(minutes: number): string {
  return new Decimal(minutes).dividedBy(MINUTES_PER_HOUR).toDecimalPlaces(4).toString();
}
