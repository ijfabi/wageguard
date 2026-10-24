# ADR 0003: Rule sets are versioned, fingerprinted and never edited

- Status: Accepted
- Date: 2026-10-22

## Context

Award rates change, usually on 1 July each year. An audit done last year still has to be reproducible after the rates move on. Fixing a mistake in a rule mustn't quietly rewrite the results of past audits either.

## Decision

A rule set is data, not code: a JSON document checked against a Zod schema (`AwardRuleSetSchema`) and some extra rules. Time windows mustn't overlap ambiguously, classifications must exist, and effective periods mustn't overlap.

Versions are named `MA000004/<effective date>/r<revision>`. A correction becomes a new revision, such as `r2`. A published file is never edited.

When a rule set is published, the SHA-256 hash of its canonical JSON goes into `published-fingerprints.json`. The registry refuses to load a published version whose content no longer matches its hash, and both the tests and CI check this. The canonical form ignores formatting, so reformatting a file doesn't break anything.

The award says new rates apply from "the first full pay period commencing on or after" a date. So a rule set is chosen by the pay period's start date, not the shift date. A shift on 2 July, in a pay period that started on 29 June, still uses the old rates.

Every rule says whether it's enabled. If it isn't, it says why. It also records how it was verified, whether a person has reviewed it, and the award's exact wording. Only rules copied from the source document can be enabled. The public holiday and overtime rules are copied in for reference but switched off, and any time they'd cover comes back as "needs review".

## Consequences

Every calculation stores the fingerprint of the rule set it used, so anyone checking a result can prove which rules produced it.

If rule sets ever move into the database, they'll need to keep the same guarantees: no edits, and fingerprints checked on load.
