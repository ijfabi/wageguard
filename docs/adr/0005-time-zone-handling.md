# ADR 0005: Wall-clock input, IANA zones, half-open intervals

- Status: Accepted
- Date: 2026-10-22

## Context

Timesheets record wall-clock times. Award rules are expressed in local days and times, such as "Saturday" or "after 6.00 pm". Australian zones observe DST, so local days can be 23 or 25 hours long.

## Decision

**Input**

- Shifts are entered as `YYYY-MM-DDTHH:MM` wall-clock times plus the employment's IANA zone. Abbreviations such as "AEST" and fixed offsets are rejected.

**Conversion to instants**

- Wall-clock times are converted to UTC instants by finding every offset in force at that wall-clock time.
- **Nonexistent** times (inside the DST start gap) and **ambiguous** times (the repeated hour when DST ends) are rejected for user input. An explicit UTC offset can be supplied to resolve an ambiguous time.
- Rule boundaries such as midnight use "earlier, or end of gap" resolution, which is never applied to user input.

**Intervals and attribution**

- Intervals are half-open, `[start, end)`. Touching intervals do not overlap, so a minute at 18:00 belongs to exactly one window.
- Rule windows are built per local date and converted to instants. The engine never assumes a day is 24 hours.
- A shift belongs to the pay period of its start date. Segments are attributed to the local date in which they fall.

**Persistence**

- Persisted event timestamps are UTC instants (Phase 2).

## Consequences

- DST behaviour is covered by unit and property tests, including the 2026-10-04 and 2026-04-05 transitions in `Australia/Sydney`.
- Users who work through the repeated hour must supply an offset. The UI must ask for it (Phase 3).
