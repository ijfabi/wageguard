import type { AwardRuleSet, ClassificationRate, RateRule } from "@wageguard/award-rules";
import {
  Decimal,
  Money,
  ageOn,
  employedMoreThanSixMonths,
  type EmploymentTerms,
  type EmploymentType,
  type LocalDate,
} from "@wageguard/domain";

const MINUTES_PER_HOUR = 60;
const PERCENT = 100;

/** The minimum hourly rate that percentages apply to on a given day, and where it came from. */
export interface BaseRate {
  readonly rate: Money;
  /** "ADULT", or the junior band code from the rule set (e.g. "AGE_17"). */
  readonly band: string;
  /** Percentage of the adult rate, as a string ("100" for adults). */
  readonly juniorPercent: string;
}

export interface RatePricer {
  /** The adult minimum hourly rate (Table 4), for display. */
  readonly adultHourlyRate: Money;
  /** Base rate on a date: adult, or junior by age on that date (cl. 17.2). */
  baseOn(date: LocalDate): BaseRate;
  /** Hourly rate for a rule on a base rate, rounded per the rule set's hourly-rate policy. */
  hourlyRate(rule: RateRule, base: BaseRate): Money;
  /** A rate expressed as a percentage of a base (leave loading), rounded the same way. */
  percentOf(base: BaseRate, percent: string): Money;
  /** Amount for `minutes` at `hourlyRate`, rounded once per the line-amount policy. */
  amount(hourlyRate: Money, minutes: number): Money;
  /** Amount for a quantity (weeks, shifts, kilometres) at a unit amount, rounded once. */
  quantityAmount(unitAmount: Money, quantity: Decimal): Money;
}

/** Why a junior base rate could not be worked out for a date. */
export class JuniorRateUnavailable extends Error {
  constructor(readonly reason: "DATE_OF_BIRTH_MISSING" | "EMPLOYMENT_START_DATE_MISSING") {
    super(reason);
    this.name = "JuniorRateUnavailable";
  }
}

/**
 * Builds the pricing functions for one employment.
 *
 * adult base  = Table 4 hourly rate
 * junior base = round(weekly rate x junior% / 38)   -- reproduces every junior rate in Schedule B.3
 * rate        = round(base x percent / 100)         -- reproduces every rate in Schedule B.1 to B.3
 * amount      = round(rate x minutes / 60)          -- multiply before dividing: exact until the final round
 */
export function createPricer(ruleSet: AwardRuleSet, employment: EmploymentTerms): RatePricer {
  const classification = ruleSet.classifications.find((c) => c.code === employment.classificationCode);
  if (classification === undefined) {
    throw new Error(
      `Classification ${employment.classificationCode} missing from rule set ${ruleSet.version}`,
    );
  }
  const adultHourlyRate = Money.of(classification.minimumHourlyRate);
  const adult: BaseRate = { rate: adultHourlyRate, band: "ADULT", juniorPercent: "100" };
  const { hourlyRate: ratePolicy, lineAmount: amountPolicy } = ruleSet.roundingPolicy;
  const rateCache = new Map<string, Money>();
  const baseCache = new Map<string, BaseRate>();

  const juniorBase = (date: LocalDate): BaseRate => {
    const juniors = ruleSet.juniorRates;
    if (
      juniors === undefined ||
      classification.juniorRatesApply !== true ||
      employment.dateOfBirth === null
    ) {
      return adult;
    }
    const age = ageOn(employment.dateOfBirth, date);
    if (age >= juniors.adultFromAge) {
      return adult;
    }
    const band = juniorBand(juniors.bands, age, employment, date);
    if (band.percent === "100") {
      return { ...adult, band: band.code };
    }
    const rate = Money.fromDecimal(
      new Decimal(classification.minimumWeeklyRate)
        .times(band.percent)
        .dividedBy(PERCENT)
        .dividedBy(juniors.weeklyHours),
      ratePolicy.mode,
    );
    return { rate, band: band.code, juniorPercent: band.percent };
  };

  return {
    adultHourlyRate,
    baseOn(date) {
      const key = date.toString();
      const cached = baseCache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const base = juniorBase(date);
      baseCache.set(key, base);
      return base;
    },
    hourlyRate(rule, base) {
      const key = `${rule.id}@${base.rate.toString()}`;
      const cached = rateCache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const rate = Money.fromDecimal(
        base.rate.multiplyExact(new Decimal(percentFor(rule, employment.employmentType)).dividedBy(PERCENT)),
        ratePolicy.mode,
      );
      rateCache.set(key, rate);
      return rate;
    },
    percentOf(base, percent) {
      return Money.fromDecimal(
        base.rate.multiplyExact(new Decimal(percent).dividedBy(PERCENT)),
        ratePolicy.mode,
      );
    },
    amount(hourlyRate, minutes) {
      return Money.fromDecimal(
        hourlyRate.multiplyExact(new Decimal(minutes)).dividedBy(MINUTES_PER_HOUR),
        amountPolicy.mode,
      );
    },
    quantityAmount(unitAmount, quantity) {
      return Money.fromDecimal(unitAmount.multiplyExact(quantity), amountPolicy.mode);
    },
  };
}

function juniorBand(
  bands: NonNullable<AwardRuleSet["juniorRates"]>["bands"],
  age: number,
  employment: EmploymentTerms,
  date: LocalDate,
) {
  if (age < 16) {
    return bands.find((b) => b.age === null) ?? fail();
  }
  const candidates = bands.filter((b) => b.age === age);
  if (candidates.length === 1) {
    return candidates[0] ?? fail();
  }
  if (employment.employmentStartDate === null) {
    throw new JuniorRateUnavailable("EMPLOYMENT_START_DATE_MISSING");
  }
  const longer = employedMoreThanSixMonths(employment.employmentStartDate, date);
  return (
    candidates.find((b) => b.employed === (longer ? "MORE_THAN_SIX_MONTHS" : "SIX_MONTHS_OR_LESS")) ?? fail()
  );
}

function fail(): never {
  throw new Error("Junior rate bands do not cover every age under 21");
}

export function percentFor(rule: RateRule, employmentType: EmploymentType): string {
  const percent = rule.percentOfMinimumHourlyRate[employmentType];
  if (percent === undefined) {
    throw new Error(`Rule ${rule.id} has no percentage for ${employmentType}`);
  }
  return percent;
}

/** Whether junior rates could apply to this employment at all. */
export function juniorRatesApply(
  ruleSet: AwardRuleSet,
  classification: ClassificationRate | undefined,
): boolean {
  return ruleSet.juniorRates !== undefined && classification?.juniorRatesApply === true;
}

/** Minutes as decimal hours to 4dp, for display only. */
export function minutesToHours(minutes: number): string {
  return new Decimal(minutes).dividedBy(MINUTES_PER_HOUR).toDecimalPlaces(4).toString();
}
