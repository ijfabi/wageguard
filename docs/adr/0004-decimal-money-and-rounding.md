# ADR 0004: Exact decimal money with explicit rounding stages

- Status: Accepted
- Date: 2026-10-22

## Context

JavaScript `number` cannot represent most cent values exactly (`0.1 + 0.2 !== 0.3`). The award does not prescribe a rounding method.

## Decision

**Money representation**

- `Money` wraps a private `decimal.js` clone with 50 significant digits.
- It is constructed only from decimal strings with at most 2 decimal places. A `number` is rejected at runtime as well as by the type system.
- Multiplication returns an unrounded `Decimal`. The only way back to `Money` is `Money.fromDecimal(value, RoundingMode)`, so every rounding is explicit and named.

**Rounding policy** (recorded in the rule set and on every result)

1. Hourly rate = base × percent / 100, rounded half-up to cents. This reproduces every Level 1 dollar rate published in Schedule B, which is cross-checked by a test.
2. Line amount = rate × minutes / 60, multiplying before dividing, rounded half-up to cents once per rule per pay period.
3. Pay period total = sum of the lines.

**Enforcement**

- ESLint bans `parseFloat`, `Math.round` and `toFixed` inside `domain` and `calculation-engine`.
- Durations are integer minutes.

## Consequences

- An employer that rounds per shift may differ by up to a cent per shift and rule. Reconciliation therefore applies an explicit tolerance of one cent per (shift, rule) pricing group, and reports it.
- Per-shift "indicative" amounts can differ from the period total by these rounding cents. The UI and documentation must say so.
