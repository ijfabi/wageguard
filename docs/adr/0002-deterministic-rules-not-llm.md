# ADR 0002: Entitlements come from deterministic rules, never from a language model

- Status: Accepted
- Date: 2026-10-22

## Context

A pay calculation has to give the same answer every time, be checkable afterwards, and point to the clause behind every number. A language model's output can change between runs, is hard to trace back to a clause, and can't be pinned to a particular version of the award.

## Decision

Every entitlement is calculated by pure functions working over versioned rule data. Each result records the rule-set version and its fingerprint, the source document and the clauses used, a hash of the input, the engine version and the rounding policy.

No language model sits anywhere in a calculation path. If document extraction (reading a payslip photo, say) is ever added, it may only suggest field values. The person has to confirm them, and they never influence which rules apply or how the arithmetic is done.

## Consequences

The same input, rule set and calculation time always produce byte-for-byte the same output, and a property test checks that.

Supporting a new situation means copying in the rules and verifying them, which takes longer than writing a prompt. That's the price of results that can be audited, and it's worth paying.
