# ADR 0004: Exact decimal money, rounded only at named steps

- Status: Accepted
- Date: 2026-10-22

## Context

JavaScript numbers can't hold most cent values exactly: `0.1 + 0.2` isn't `0.3`. The award also doesn't say how pay should be rounded.

## Decision

`Money` wraps a private copy of `decimal.js` working to 50 significant digits. It can only be created from a decimal string with at most two decimal places. Passing a JavaScript number is rejected by the type system and again at run time. Multiplying gives an unrounded `Decimal`, and the only way back to `Money` is `Money.fromDecimal(value, RoundingMode)`, so every rounding is deliberate and says how it rounds.

Rounding happens at three points, and the policy is stored in the rule set and on every result:

1. The hourly rate is the base rate times the percentage, rounded half-up to the cent. That reproduces every Level 1 dollar rate published in Schedule B, which a test checks.
2. Each pay line is the rate times the minutes divided by 60, multiplying before dividing, rounded half-up once per rule per pay period.
3. The pay-period total is the sum of the lines.

ESLint bans `parseFloat`, `Math.round` and `toFixed` in the domain and engine packages, and durations are always whole minutes.

## Consequences

An employer who rounds per shift instead of per pay line can come out up to a cent different per shift and rule. Reconciliation allows for exactly that: a tolerance of one cent per (shift, rule) group, which it reports alongside the result.

The amounts shown for individual shifts can differ from the pay-period total by those same rounding cents. The web app and the PDF both say so where the per-shift figures appear.
