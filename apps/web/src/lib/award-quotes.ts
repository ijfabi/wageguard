import { bundledRegistry, type AwardRuleSet } from "@wageguard/award-rules";

/** The rule set the homepage quotes from: the one the calculation engine uses. */
export const QUOTED_RULE_SET = "MA000004/2026-07-01/r1";

/** Clauses that read well on their own, most relatable first. Others follow in document order. */
const PREFERRED = ["11.1", "16.6(a)", "11.2", "10.9", "15.4", "15.5", "16.6(b)"];

export interface AwardQuote {
  readonly clause: string;
  readonly text: string;
}

interface Source {
  readonly clause: string;
  readonly excerpt: string;
}

function collectSources(value: unknown, out: Source[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSources(item, out);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record["clause"] === "string" && typeof record["excerpt"] === "string") {
    out.push({ clause: record["clause"], excerpt: record["excerpt"] });
    return;
  }
  for (const child of Object.values(record)) {
    collectSources(child, out);
  }
}

/**
 * Word-for-word sentences from the award, taken from the rule set's own source excerpts, so a quote
 * can never drift from the text the calculation relies on. Table rows (rates, spans) are left out
 * because they don't read as sentences, and abridged excerpts (with "...") because they aren't
 * word for word.
 */
export function awardQuotes(ruleSet: AwardRuleSet, limit = 6): AwardQuote[] {
  const sources: Source[] = [];
  collectSources(ruleSet.rateRules, sources);
  collectSources(ruleSet.constraints, sources);
  const prose = new Map<string, string>();
  for (const { clause, excerpt } of sources) {
    const text = excerpt.trim();
    const isSentence = !text.includes("|") && !text.includes("...") && text.endsWith(".");
    if (isSentence && text.length <= 260 && !prose.has(clause)) {
      prose.set(clause, text);
    }
  }
  const rank = (clause: string) => {
    const index = PREFERRED.indexOf(clause);
    return index === -1 ? PREFERRED.length : index;
  };
  return [...prose.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .slice(0, limit)
    .map(([clause, text]) => ({ clause, text }));
}

/** Quotes and their provenance for the homepage (server-side only). */
export function homepageQuotes(): { quotes: AwardQuote[]; awardTitle: string; consolidatedTo: string } {
  const registered = bundledRegistry().get(QUOTED_RULE_SET);
  if (registered === null) {
    throw new Error(`Rule set ${QUOTED_RULE_SET} is not bundled`);
  }
  const { ruleSet } = registered;
  return {
    quotes: awardQuotes(ruleSet),
    awardTitle: ruleSet.awardTitle,
    consolidatedTo: ruleSet.source.consolidatedAsAt,
  };
}
