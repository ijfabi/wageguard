# ADR 0003: Versioned, immutable, fingerprinted rule sets

- Status: Accepted
- Date: 2026-10-22

## Context

Award rates change, usually from 1 July each year. A completed audit must stay reproducible after a rate change, and a correction to a rule must never silently rewrite history.

## Decision

- **Data, not code.** A rule set is a JSON document validated by a Zod schema (`AwardRuleSetSchema`) and by semantic checks: no ambiguous overlapping windows, valid classification references, and non-overlapping effective periods.
- **Versioning.** Versions are named `MA000004/<effective-date>/r<revision>`. A correction becomes a new revision (`r2`); the published file is never edited.
- **Immutability.** When a rule set is published, the SHA-256 of its canonical JSON is recorded in `published-fingerprints.json`. The registry refuses to load a published version whose content no longer matches. This is checked in tests and in CI. The canonical form ignores formatting, so reformatting a file is safe.
- **Effective periods.** Effective dates follow the award's "first full pay period commencing on or after" (`ppc`) wording, so selection uses the pay period's start date. A shift on 2 July in a pay period that started on 29 June uses the previous rates.
- **Explicit status per rule.** Each rule carries `ENABLED` or `DISABLED` with a reason, a verification status, a human-review status, and verbatim source excerpts. Only rules transcribed from the source may be enabled.
- **Reference-only rules.** Overtime rules may not be enabled in this engine version. Public holiday and overtime rules are transcribed for reference but disabled; time they would govern is returned as `REVIEW_REQUIRED`.

## Consequences

- Every calculation stores the rule-set fingerprint, so an auditor can prove which rules produced a result.
- Persisting rule sets in the database (Phase 2) must keep the same immutability and fingerprint guarantees.
