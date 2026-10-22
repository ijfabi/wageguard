# ADR 0002: Deterministic rules, never an LLM, for entitlements

- Status: Accepted
- Date: 2026-10-22

## Context

Payroll entitlements must be reproducible, auditable and explainable. An LLM's output can vary between runs, is hard to trace to a clause, and cannot be versioned against a specific award variation.

## Decision

- All entitlements are computed by pure functions over versioned rule data.
- Every result records:
  - the rule-set version and its fingerprint
  - the source URL and the clauses relied on
  - an input hash
  - the engine version
  - the rounding policy
- No LLM is a dependency of any calculation path.
- If AI-assisted document extraction is added later, it may only propose payslip field values. The user must confirm those values, and they never feed rule selection or arithmetic.

## Consequences

- Identical input, rule set and `calculatedAt` give byte-identical output. A property test checks this.
- Supporting a new scenario means transcribing and verifying rules, which is slower than prompting. That is deliberate.
