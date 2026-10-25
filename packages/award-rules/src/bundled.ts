import ma000004_2026_07_01_r1 from "./data/MA000004/2026-07-01.r1.json" with { type: "json" };
import ma000004_2026_07_01_r2 from "./data/MA000004/2026-07-01.r2.json" with { type: "json" };
import publishedFingerprints from "./published-fingerprints.json" with { type: "json" };
import { AwardRuleRegistry } from "./registry.js";

/** Every rule set shipped with this build, oldest first. Never edit a published file in place. */
/** r2 supersedes r1 for the same period; r1 stays loadable so audits made with it can be explained. */
export const BUNDLED_RULE_SETS: readonly unknown[] = [ma000004_2026_07_01_r1, ma000004_2026_07_01_r2];

export const PUBLISHED_FINGERPRINTS: Readonly<Record<string, string>> = publishedFingerprints;

let defaultRegistry: AwardRuleRegistry | undefined;

/** The registry of bundled, published rule sets. Built once and cached; it is immutable. */
export function bundledRegistry(): AwardRuleRegistry {
  defaultRegistry ??= AwardRuleRegistry.create(BUNDLED_RULE_SETS, {
    publishedFingerprints: PUBLISHED_FINGERPRINTS,
  });
  return defaultRegistry;
}
