import { LocalDate, contentHash } from "@wageguard/domain";

import { AwardRuleSetSchema, type AwardRuleSet, type RateRule } from "./schema.js";

export class RuleSetValidationError extends Error {
  constructor(
    readonly version: string,
    readonly problems: readonly string[],
  ) {
    super(`Rule set ${version} is invalid: ${problems.join("; ")}`);
    this.name = "RuleSetValidationError";
  }
}

/** A published rule set's content no longer matches the fingerprint recorded when it was published. */
export class RuleSetIntegrityError extends Error {
  constructor(readonly version: string) {
    super(
      `Rule set ${version} differs from its published fingerprint. Published rule sets are immutable: ` +
        "publish a corrected revision under a new version instead of editing this one.",
    );
    this.name = "RuleSetIntegrityError";
  }
}

export interface RegisteredRuleSet {
  readonly ruleSet: AwardRuleSet;
  /** SHA-256 of the rule set's canonical JSON. Stored with every calculation for reproducibility. */
  readonly fingerprint: string;
}

export interface RuleSetSummary {
  readonly version: string;
  readonly awardCode: string;
  readonly awardTitle: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly effectiveBasis: string;
  readonly fingerprint: string;
  readonly sourceUrl: string;
  readonly enabledRuleCount: number;
  readonly disabledRuleCount: number;
}

export interface RegistryOptions {
  /** version -> SHA-256. Every rule set must appear here unless `allowUnpublished` is true. */
  readonly publishedFingerprints: Readonly<Record<string, string>>;
  /** For tests and local drafting only. */
  readonly allowUnpublished?: boolean;
}

export class AwardRuleRegistry {
  private readonly byVersion: ReadonlyMap<string, RegisteredRuleSet>;

  private constructor(entries: readonly RegisteredRuleSet[]) {
    this.byVersion = new Map(entries.map((e) => [e.ruleSet.version, e]));
  }

  static create(rawRuleSets: readonly unknown[], options: RegistryOptions): AwardRuleRegistry {
    const entries = rawRuleSets.map((raw) => register(raw, options));
    assertUniqueVersions(entries);
    assertNonOverlappingEffectivePeriods(entries);
    return new AwardRuleRegistry(entries);
  }

  get(version: string): RegisteredRuleSet | null {
    return this.byVersion.get(version) ?? null;
  }

  /**
   * Selects the rule set in force for a pay period. MA000004 variations take effect from the first
   * full pay period commencing on or after the operative date, so selection uses the pay period's
   * start date. Returns null when no verified rule set covers the period.
   */
  resolveForPayPeriod(awardCode: string, payPeriodStart: LocalDate): RegisteredRuleSet | null {
    for (const entry of this.byVersion.values()) {
      const { ruleSet } = entry;
      if (ruleSet.awardCode !== awardCode) {
        continue;
      }
      const from = LocalDate.parse(ruleSet.effective.from);
      const until = ruleSet.effective.until === null ? null : LocalDate.parse(ruleSet.effective.until);
      if (!payPeriodStart.isBefore(from) && (until === null || payPeriodStart.isBefore(until))) {
        return entry;
      }
    }
    return null;
  }

  list(): RuleSetSummary[] {
    return [...this.byVersion.values()]
      .map(({ ruleSet, fingerprint }) => ({
        version: ruleSet.version,
        awardCode: ruleSet.awardCode,
        awardTitle: ruleSet.awardTitle,
        effectiveFrom: ruleSet.effective.from,
        effectiveUntil: ruleSet.effective.until,
        effectiveBasis: ruleSet.effective.basis,
        fingerprint,
        sourceUrl: ruleSet.source.url,
        enabledRuleCount: ruleSet.rateRules.filter((r) => r.status === "ENABLED").length,
        disabledRuleCount: ruleSet.rateRules.filter((r) => r.status === "DISABLED").length,
      }))
      .sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
  }
}

function register(raw: unknown, options: RegistryOptions): RegisteredRuleSet {
  const parsed = AwardRuleSetSchema.safeParse(raw);
  const version = describeVersion(raw);
  if (!parsed.success) {
    throw new RuleSetValidationError(
      version,
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  const ruleSet = parsed.data;
  const problems = semanticProblems(ruleSet);
  if (problems.length > 0) {
    throw new RuleSetValidationError(ruleSet.version, problems);
  }

  const fingerprint = contentHash(ruleSet);
  const published = options.publishedFingerprints[ruleSet.version];
  if (published === undefined && options.allowUnpublished !== true) {
    throw new RuleSetValidationError(ruleSet.version, ["Rule set has no published fingerprint"]);
  }
  if (published !== undefined && published !== fingerprint) {
    throw new RuleSetIntegrityError(ruleSet.version);
  }
  return Object.freeze({ ruleSet: deepFreeze(ruleSet), fingerprint });
}

/** Cross-field checks that a JSON schema cannot express. */
export function semanticProblems(ruleSet: AwardRuleSet): string[] {
  const problems: string[] = [];
  const classificationCodes = new Set(ruleSet.classifications.map((c) => c.code));

  if (ruleSet.effective.until !== null && ruleSet.effective.until <= ruleSet.effective.from) {
    problems.push("effective.until must be after effective.from");
  }
  for (const code of ruleSet.supportedScope.classifications) {
    if (!classificationCodes.has(code)) {
      problems.push(`supportedScope references unknown classification ${code}`);
    }
  }
  const ruleIds = new Set<string>();
  for (const rule of ruleSet.rateRules) {
    if (ruleIds.has(rule.id)) {
      problems.push(`duplicate rule id ${rule.id}`);
    }
    ruleIds.add(rule.id);
    for (const code of rule.appliesTo.classifications) {
      if (!classificationCodes.has(code)) {
        problems.push(`rule ${rule.id} references unknown classification ${code}`);
      }
    }
  }
  problems.push(...ambiguousWindowProblems(ruleSet.rateRules));
  return problems;
}

/** Two enabled windows that can match the same minute must have different precedence. */
function ambiguousWindowProblems(rules: readonly RateRule[]): string[] {
  const windows = rules.filter((r) => r.status === "ENABLED" && r.when.kind === "WEEKLY_WINDOW");
  const problems: string[] = [];
  for (let i = 0; i < windows.length; i += 1) {
    for (let j = i + 1; j < windows.length; j += 1) {
      const a = windows[i] as RateRule;
      const b = windows[j] as RateRule;
      if (
        a.when.kind !== "WEEKLY_WINDOW" ||
        b.when.kind !== "WEEKLY_WINDOW" ||
        a.precedence !== b.precedence
      ) {
        continue;
      }
      const sharesDay = a.when.days.some((d) => b.when.kind === "WEEKLY_WINDOW" && b.when.days.includes(d));
      const sharesType = a.appliesTo.employmentTypes.some((t) => b.appliesTo.employmentTypes.includes(t));
      const sharesClass = a.appliesTo.classifications.some((c) => b.appliesTo.classifications.includes(c));
      const overlaps = a.when.from < b.when.to && b.when.from < a.when.to;
      if (sharesDay && sharesType && sharesClass && overlaps) {
        problems.push(`rules ${a.id} and ${b.id} overlap with equal precedence ${a.precedence}`);
      }
    }
  }
  return problems;
}

function assertUniqueVersions(entries: readonly RegisteredRuleSet[]): void {
  const seen = new Set<string>();
  for (const { ruleSet } of entries) {
    if (seen.has(ruleSet.version)) {
      throw new RuleSetValidationError(ruleSet.version, ["duplicate version"]);
    }
    seen.add(ruleSet.version);
  }
}

function assertNonOverlappingEffectivePeriods(entries: readonly RegisteredRuleSet[]): void {
  const byAward = new Map<string, AwardRuleSet[]>();
  for (const { ruleSet } of entries) {
    byAward.set(ruleSet.awardCode, [...(byAward.get(ruleSet.awardCode) ?? []), ruleSet]);
  }
  for (const sets of byAward.values()) {
    const sorted = [...sets].sort((a, b) => (a.effective.from < b.effective.from ? -1 : 1));
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1] as AwardRuleSet;
      const current = sorted[i] as AwardRuleSet;
      if (previous.effective.until === null || previous.effective.until > current.effective.from) {
        throw new RuleSetValidationError(current.version, [
          `effective period overlaps ${previous.version}; close the earlier version with an 'until' date`,
        ]);
      }
    }
  }
}

function describeVersion(raw: unknown): string {
  if (raw !== null && typeof raw === "object" && "version" in raw && typeof raw.version === "string") {
    return raw.version;
  }
  return "<unknown>";
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
