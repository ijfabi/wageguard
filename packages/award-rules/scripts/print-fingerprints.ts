/**
 * Prints the canonical fingerprint of every bundled rule set. Used once, when a new rule set
 * version is published, to record its fingerprint in src/published-fingerprints.json.
 */
import { contentHash } from "@wageguard/domain";

import { AwardRuleSetSchema, BUNDLED_RULE_SETS, PUBLISHED_FINGERPRINTS } from "../src/index.js";

for (const raw of BUNDLED_RULE_SETS) {
  const ruleSet = AwardRuleSetSchema.parse(raw);
  const fingerprint = contentHash(ruleSet);
  const published = PUBLISHED_FINGERPRINTS[ruleSet.version];
  const state =
    published === undefined
      ? "UNPUBLISHED"
      : published === fingerprint
        ? "OK"
        : "MODIFIED (integrity failure)";
  console.log(`${ruleSet.version}\t${fingerprint}\t${state}`);
}
