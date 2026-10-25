import { LocalDate } from "@wageguard/domain";
import { describe, expect, it } from "vitest";

import {
  AwardRuleRegistry,
  AwardRuleSetSchema,
  BUNDLED_RULE_SETS,
  PUBLISHED_FINGERPRINTS,
  RuleSetIntegrityError,
  RuleSetValidationError,
  bundledRegistry,
  type AwardRuleSet,
} from "../src/index.js";

const original = (): AwardRuleSet => structuredClone(AwardRuleSetSchema.parse(BUNDLED_RULE_SETS[0]));
const draft = (mutate: (r: AwardRuleSet) => void): AwardRuleSet => {
  const ruleSet = original();
  mutate(ruleSet);
  return ruleSet;
};
const createDraft = (...sets: AwardRuleSet[]): AwardRuleRegistry =>
  AwardRuleRegistry.create(sets, { publishedFingerprints: {}, allowUnpublished: true });

describe("bundled registry", () => {
  it("loads every bundled rule set and matches its published fingerprint", () => {
    const registry = bundledRegistry();
    const [summary] = registry.list();
    expect(summary?.version).toBe("MA000004/2026-07-01/r1");
    expect(summary?.fingerprint).toBe(PUBLISHED_FINGERPRINTS["MA000004/2026-07-01/r1"]);
    expect(summary?.enabledRuleCount).toBe(4);
    expect(summary?.disabledRuleCount).toBe(5);
    expect(bundledRegistry()).toBe(registry);
  });

  it("deep-freezes rule sets so they cannot be mutated at runtime", () => {
    const entry = bundledRegistry().get("MA000004/2026-07-01/r1");
    expect(entry).not.toBeNull();
    expect(Object.isFrozen(entry?.ruleSet.rateRules[0]?.percentOfMinimumHourlyRate)).toBe(true);
    expect(() => {
      (entry?.ruleSet.classifications[0] as { minimumHourlyRate: string }).minimumHourlyRate = "1.00";
    }).toThrow(TypeError);
    expect(bundledRegistry().get("nope")).toBeNull();
  });

  it("resolves by pay period start using first-full-pay-period semantics", () => {
    const registry = bundledRegistry();
    // r2 supersedes r1 for the same period, so new calculations use r2.
    expect(registry.resolveForPayPeriod("MA000004", LocalDate.parse("2026-07-01"))?.ruleSet.version).toBe(
      "MA000004/2026-07-01/r2",
    );
    expect(registry.resolveForPayPeriod("MA000004", LocalDate.parse("2026-06-29"))).toBeNull();
    expect(registry.resolveForPayPeriod("MA000009", LocalDate.parse("2026-07-06"))).toBeNull();
  });

  it("keeps a superseded revision loadable and says what replaced it", () => {
    const registry = bundledRegistry();
    expect(registry.get("MA000004/2026-07-01/r1")?.ruleSet.version).toBe("MA000004/2026-07-01/r1");
    expect(registry.list().map((s) => [s.version, s.supersededBy])).toEqual([
      ["MA000004/2026-07-01/r1", "MA000004/2026-07-01/r2"],
      ["MA000004/2026-07-01/r2", null],
    ]);
  });

  it("only lets a revision supersede one loaded for exactly the same period", () => {
    const [r1, r2] = BUNDLED_RULE_SETS.map((raw) => structuredClone(AwardRuleSetSchema.parse(raw)));
    const create = (...sets: unknown[]) =>
      AwardRuleRegistry.create(sets, { publishedFingerprints: {}, allowUnpublished: true });
    expect(() => create(r2)).toThrow(/must be loaded/);
    expect(() => create(r1, { ...r2!, effective: { ...r2!.effective, from: "2026-07-02" } })).toThrow(
      /same effective period/,
    );
    expect(() => create(r1, { ...r2!, supersedes: undefined })).toThrow(/overlaps/);
  });
});

describe("transcribed values (regression guard against accidental edits)", () => {
  const ruleSet = original();
  const rule = (id: string) => ruleSet.rateRules.find((r) => r.id === id);

  it("matches MA000004 cl. 17.1 Table 4 for Level 1", () => {
    expect(ruleSet.classifications[0]).toMatchObject({
      minimumHourlyRate: "27.81",
      minimumWeeklyRate: "1056.80",
    });
  });

  it.each([
    ["MA000004.ORD.WEEKDAY", "100", "125", ["MON", "TUE", "WED", "THU", "FRI"], "07:00", "18:00"],
    ["MA000004.PEN.WEEKDAY_AFTER_6PM", "125", "150", ["MON", "TUE", "WED", "THU", "FRI"], "18:00", "21:00"],
    ["MA000004.PEN.SATURDAY", "125", "150", ["SAT"], "07:00", "18:00"],
    ["MA000004.PEN.SUNDAY", "150", "175", ["SUN"], "09:00", "18:00"],
  ])("%s: part-time %s%%, casual %s%%", (id, partTime, casual, days, from, to) => {
    expect(rule(id)).toMatchObject({
      status: "ENABLED",
      percentOfMinimumHourlyRate: { PART_TIME: partTime, CASUAL: casual },
      when: { kind: "WEEKLY_WINDOW", days, from, to },
    });
  });

  it("keeps public holiday and overtime rules disabled with reasons", () => {
    for (const r of ruleSet.rateRules.filter(
      (x) => x.category === "PUBLIC_HOLIDAY" || x.category === "OVERTIME",
    )) {
      expect(r.status).toBe("DISABLED");
      expect(r.disabledReason).toBeTruthy();
    }
  });

  it("states casual percentages inclusive of the 25% loading: casual = part-time + 25 points (Table 11 note 2)", () => {
    for (const r of ruleSet.rateRules) {
      const { PART_TIME: partTime, CASUAL: casualPercent } = r.percentOfMinimumHourlyRate;
      expect(Number(casualPercent) - Number(partTime), r.id).toBe(25);
    }
  });
});

describe("immutability and integrity", () => {
  it("rejects a published rule set whose content was edited", () => {
    const tampered = draft((r) => {
      (r.classifications[0] as { minimumHourlyRate: string }).minimumHourlyRate = "27.82";
    });
    expect(() =>
      AwardRuleRegistry.create([tampered], { publishedFingerprints: PUBLISHED_FINGERPRINTS }),
    ).toThrow(RuleSetIntegrityError);
  });

  it("rejects unpublished rule sets unless drafts are explicitly allowed", () => {
    const next = draft((r) => {
      r.version = "MA000004/2026-07-01/r2";
    });
    expect(() => AwardRuleRegistry.create([next], { publishedFingerprints: {} })).toThrow(
      /no published fingerprint/,
    );
    expect(createDraft(next).list()).toHaveLength(1);
  });
});

describe("schema and semantic validation", () => {
  const expectInvalid = (mutate: (r: AwardRuleSet) => void, message: RegExp): void => {
    expect(() => createDraft(draft(mutate))).toThrow(message);
  };

  it("rejects malformed input with every schema issue listed", () => {
    expect(() => AwardRuleRegistry.create([{ version: "x" }], { publishedFingerprints: {} })).toThrow(
      RuleSetValidationError,
    );
    expect(() => AwardRuleRegistry.create([42], { publishedFingerprints: {} })).toThrow(/<unknown>/);
  });

  it("rejects enabled rules that are not source-verified", () => {
    expectInvalid((r) => {
      r.rateRules[0]!.verification.status = "UNVERIFIED";
    }, /Only source-verified rules may be enabled/);
  });

  it("rejects disabled rules without a reason and enabled overtime rules", () => {
    expectInvalid((r) => {
      r.rateRules[0]!.status = "DISABLED";
    }, /must state why/);
    expectInvalid((r) => {
      const ot = r.rateRules.find((x) => x.category === "OVERTIME")!;
      ot.status = "ENABLED";
    }, /which days or public holidays/);
  });

  it("requires derived rules to record how they were derived", () => {
    expectInvalid((r) => {
      r.rateRules[0]!.verification = { status: "DERIVED_FROM_SOURCE", humanReview: "PENDING" };
    }, /record how they were derived/);
  });

  it("rejects missing percentages, reversed windows and duplicate ids", () => {
    expectInvalid((r) => {
      delete r.rateRules[0]!.percentOfMinimumHourlyRate.CASUAL;
    }, /Missing percentage for CASUAL/);
    expectInvalid((r) => {
      r.rateRules[0]!.when = { kind: "WEEKLY_WINDOW", days: ["MON"], from: "18:00", to: "07:00" };
    }, /end after it starts/);
    expectInvalid((r) => {
      r.rateRules[1]!.id = r.rateRules[0]!.id;
    }, /duplicate rule id/);
  });

  it("rejects ambiguous overlapping windows with equal precedence", () => {
    expectInvalid((r) => {
      r.rateRules[1]!.precedence = r.rateRules[0]!.precedence;
      r.rateRules[1]!.when = { kind: "WEEKLY_WINDOW", days: ["MON"], from: "17:00", to: "21:00" };
    }, /overlap with equal precedence/);
  });

  it("allows overlapping windows when precedence differs", () => {
    const ok = draft((r) => {
      r.rateRules[1]!.when = { kind: "WEEKLY_WINDOW", days: ["MON"], from: "17:00", to: "21:00" };
    });
    expect(() => createDraft(ok)).not.toThrow();
  });

  it("rejects unknown classification references and inverted effective dates", () => {
    expectInvalid((r) => {
      r.supportedScope.classifications = ["RETAIL_EMPLOYEE_LEVEL_9"];
    }, /unknown classification/);
    expectInvalid((r) => {
      r.rateRules[0]!.appliesTo.classifications = ["RETAIL_EMPLOYEE_LEVEL_9"];
    }, /unknown classification/);
    expectInvalid((r) => {
      r.effective.until = "2026-01-01";
    }, /until must be after/);
  });

  it("rejects duplicate versions and overlapping effective periods", () => {
    expect(() => createDraft(original(), original())).toThrow(/duplicate version/);
    const later = draft((r) => {
      r.version = "MA000004/2027-07-01/r1";
      r.effective.from = "2027-07-01";
    });
    expect(() => createDraft(original(), later)).toThrow(/overlaps/);
  });

  it("resolves the right historical version across a rate change", () => {
    const closed = draft((r) => {
      r.effective.until = "2027-07-01";
    });
    const later = draft((r) => {
      r.version = "MA000004/2027-07-01/r1";
      r.effective.from = "2027-07-01";
    });
    const registry = createDraft(later, closed);
    expect(registry.resolveForPayPeriod("MA000004", LocalDate.parse("2027-06-30"))?.ruleSet.version).toBe(
      "MA000004/2026-07-01/r1",
    );
    expect(registry.resolveForPayPeriod("MA000004", LocalDate.parse("2027-07-01"))?.ruleSet.version).toBe(
      "MA000004/2027-07-01/r1",
    );
    expect(registry.list().map((s) => s.version)).toEqual([
      "MA000004/2026-07-01/r1",
      "MA000004/2027-07-01/r1",
    ]);
  });
});
