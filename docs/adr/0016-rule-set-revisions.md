# ADR 0016: Rule set revisions supersede earlier ones for the same dates

- Status: Accepted
- Date: 2026-10-25

## Context

Rule set `MA000004/2026-07-01/r1` priced only Level 1 adults on casual and part-time contracts, inside the ordinary span. Overtime, public holidays, other levels, juniors, shiftwork, allowances and leave were recorded with their rates but switched off, so audits that touched them came back as "needs review" ([ADR 0008](0008-review-required-over-partial-guesses.md)).

Pricing those situations changes what the engine produces for the same pay periods. A published rule set can't be edited ([ADR 0003](0003-versioned-immutable-rule-sets.md)), and audits already calculated with r1 must still rebuild their reports exactly.

## Decision

A rule set can name the revision it `supersedes`. `MA000004/2026-07-01/r2` supersedes r1 and covers the same pay periods. When more than one revision covers a period, the registry resolves it to the newest one. Both stay published and fingerprinted, and `GET /rules/versions` shows which replaces which.

Everything r2 prices is data, not code: rate windows, overtime and break rates, junior percentages, shiftwork rates, allowances with a machine-readable basis, and the minimum engagement and break constraints, each with the award's words quoted. The engine keys off those fields, never off rule or allowance codes. Features a rule set doesn't define (r1 has no overtime rules, for instance) fall back to the old flag-for-review behaviour, so r1 audits still calculate exactly as they did.

Every dollar rate in Schedule B.1 to B.3 is reproduced by a test from the rule set's percentages, and new golden scenarios were worked out by hand from those rates.

Public holidays come from a calendar bundled with the rule data: the Fair Work Ombudsman's state and territory lists for 2026 and 2027, with each list's address, retrieval date and hash. An audit uses the state-wide holidays for the employment's state unless the request lists its own, and the list used is saved with the audit's input.

## Consequences

New audits for the same pay period can give a different answer from older ones, because they price what r1 only flagged. Each audit records the rule set and fingerprint it used, so the two are never confused, and older audits never change.

Corrections work the same way: a new revision for the same dates, never an edit.

The calendar has to be refreshed each year, and a pay period outside the covered years gets no automatic holidays. The audit form says so, and the user can add them.
