# ADR 0005: Times as written, real time zones, and intervals that don't double-count

- Status: Accepted
- Date: 2026-10-22

## Context

Timesheets record clock times. The award talks in local days and times, such as "Saturday" or "after 6.00 pm". Most Australian states observe daylight saving, so a local day can be 23 or 25 hours long.

## Decision

Shifts are entered as clock times (`YYYY-MM-DDTHH:MM`), together with the employment's IANA time zone. Abbreviations like "AEST" and fixed offsets aren't accepted, because they can't follow daylight saving.

A clock time is turned into a moment in UTC by finding every offset in force at that time. If a time falls in the hour skipped when daylight saving starts, it doesn't exist, and it's rejected. If it falls in the hour repeated when daylight saving ends, it's ambiguous, and it's also rejected unless the person gives an explicit UTC offset to say which one they meant. Rule boundaries like midnight resolve those cases automatically (the earlier time, or the end of the gap), but that shortcut is never applied to what a person typed.

Intervals include their start and exclude their end. Back-to-back intervals don't overlap, so the minute at 18:00 belongs to exactly one rate. Rule windows are built for each local date and then converted to UTC, so the engine never assumes a day lasts 24 hours. A shift belongs to the pay period it starts in, and each piece of it counts towards the local date it falls on. Timestamps in the database are stored in UTC.

## Consequences

Unit and property tests cover the daylight-saving changes, including 4 October 2026 and 5 April 2026 in `Australia/Sydney`.

Anyone working through the repeated hour has to give an offset. The API accepts one, but the web form doesn't ask for it yet, which is listed in the [known limitations](../known-limitations.md).
