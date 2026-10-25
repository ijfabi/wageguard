import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BUNDLED_RULE_SETS } from "../src/bundled.js";
import { AwardRuleSetSchema } from "../src/schema.js";

/**
 * The retrieved award is Commonwealth copyright, so it is kept locally and not committed (see
 * docs/award-sources.md). These checks run wherever that copy exists and are skipped otherwise.
 */
const AWARD_TEXT = new URL(
  "../../../docs/award-sources/MA000004/MA000004-consolidated-retrieved-2026-10-22.txt",
  import.meta.url,
);
const available = existsSync(AWARD_TEXT);

/**
 * r1 paraphrased the layout of two tables instead of quoting them. Published rule sets are
 * immutable, so r1 keeps them; r2 quotes the same tables as written. Nothing may be added here.
 */
const KNOWN_PARAPHRASES: Readonly<Record<string, readonly string[]>> = {
  "MA000004/2026-07-01/r1": [
    'ruleSet.rateRules[0].sources[2] cl. Schedule B: "Ordinary hours 100%"',
    'ruleSet.rateRules[0].sources[2] cl. Schedule B: "Retail Employee Level 1 27.81; B.2.1 Casual adult employees other than shiftworkers"',
    'ruleSet.rateRules[0].sources[2] cl. Schedule B: "Ordinary hours 125%"',
    'ruleSet.rateRules[0].sources[2] cl. Schedule B: "Retail Employee Level 1 34.76"',
    'ruleSet.rateRules[1].sources[0] cl. 22.1: "Time of ordinary hours worked | Full-time and part-time employees % of minimum hourly rate | Casual employees % of minimum hourly rate (inclusive of casual loading)"',
  ],
};

/** Table cells sit on separate lines in the text, so compare on single spaces. */
const flatten = (text: string) => text.replace(/\s+/g, " ").trim();

interface Excerpt {
  readonly where: string;
  readonly excerpt: string;
}

function collect(value: unknown, where: string, out: Excerpt[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      collect(item, `${where}[${i}]`, out);
    });
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record["excerpt"] === "string" && typeof record["clause"] === "string") {
    out.push({ where: `${where} cl. ${record["clause"]}`, excerpt: record["excerpt"] });
    return;
  }
  for (const [key, child] of Object.entries(record)) {
    collect(child, `${where}.${key}`, out);
  }
}

describe.skipIf(!available)("rule set sources (against the locally retrieved award)", () => {
  const award = available ? flatten(readFileSync(AWARD_TEXT, "utf8")) : "";

  it.each(BUNDLED_RULE_SETS.map((raw) => AwardRuleSetSchema.parse(raw)).map((r) => [r.version, r] as const))(
    "%s quotes the award word for word",
    (_version, ruleSet) => {
      const excerpts: Excerpt[] = [];
      collect(ruleSet, "ruleSet", excerpts);
      expect(excerpts.length).toBeGreaterThan(10);
      // " ... " marks words left out; each remaining piece must appear in the award as written.
      const missing = excerpts.flatMap(({ where, excerpt }) =>
        excerpt
          .split(" ... ")
          .map((piece) => flatten(piece))
          .filter((piece) => piece !== "" && !award.includes(piece))
          .map((piece) => `${where}: "${piece}"`),
      );
      expect(missing).toEqual(KNOWN_PARAPHRASES[ruleSet.version] ?? []);
    },
  );
});
