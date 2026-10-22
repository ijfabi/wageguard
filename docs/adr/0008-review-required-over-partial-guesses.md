# ADR 0008: Price whole shifts or none; never guess unsupported entitlements

- Status: Accepted
- Date: 2026-10-22

## Context

Some conditions mean part of a shift may attract an entitlement WageGuard does not calculate:

- work outside the span of ordinary hours
- a declared public holiday
- a shift shorter than the minimum engagement
- more than 9 hours in a day, or more than 38 casual hours in a week
- part-time hours beyond the guaranteed hours
- less than 12 hours between work days

Attributing the overtime to specific minutes would require modelling rules that are not implemented, such as the cl. 21.2(b) daily ordering and written variations under cl. 10.6.

## Decision

**Pricing scope**

- A blocking issue (any severity except `WARNING`) marks the affected shifts as unpriced.
- Unpriced shifts are still segmented and classified, so the explanation remains useful, but they carry no amounts.
- Employment-level scope issues leave the whole pay period unpriced.

**Status precedence**

- `UNSUPPORTED_SCENARIO` beats `INCOMPLETE_DATA`, which beats `REVIEW_REQUIRED`, which beats `CALCULATED`.

**Reconciliation**

- When some shifts are unpriced, the priced total is a lower bound on the award minimum, because unpriced time can only add to it.
- Reported pay below that lower bound is reported as `POTENTIAL_UNDERPAYMENT`, with an explanation of the lower-bound basis. Otherwise the result is `REVIEW_REQUIRED`.
- A `MATCHED` status is never shown for a partial calculation.

## Consequences

- WageGuard can say less than a full payroll system, but it never presents an unsupported figure as verified.
- The golden REJECTION scenarios and a property test ("outside-span or holiday minutes are never priced") enforce this.
