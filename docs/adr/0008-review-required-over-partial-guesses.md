# ADR 0008: Price a whole shift or none of it, and never guess an entitlement

- Status: Accepted
- Date: 2026-10-22

## Context

Some situations mean part of a shift might be owed more than the ordinary rate, under rules WageGuard doesn't calculate:

- work outside the span of ordinary hours;
- a public holiday;
- a shift shorter than the minimum engagement;
- more than 9 hours in a day, or a casual working more than 38 hours in a week;
- part-time hours beyond the guaranteed hours;
- less than 12 hours between one day's work and the next.

Working out exactly which minutes become overtime would mean modelling rules that aren't implemented, such as the daily ordering in cl. 21.2(b) and written variations under cl. 10.6.

## Decision

Any issue more serious than a warning marks the affected shifts as unpriced. They're still split up and classified, so the explanation remains useful, but they carry no dollar amounts. A problem with the employment itself, such as an unsupported contract type, leaves the whole pay period unpriced.

When statuses compete, "not supported" beats "missing information", which beats "needs review", which beats "calculated".

When some shifts are unpriced, the priced total is a floor under the award minimum, because unpriced time can only add to what's owed. If the payslip is below that floor, the audit reports a possible underpayment and explains that the comparison is against a lower bound. Otherwise it says "needs review". A partial calculation is never shown as a match.

## Consequences

WageGuard says less than a full payroll system would, but it never presents a figure it couldn't verify as if it were verified. The golden refusal scenarios and a property test ("time outside the span or on a public holiday is never priced") hold it to that.
