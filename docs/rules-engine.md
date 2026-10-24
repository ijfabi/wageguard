# Rules engine

## What rule set `MA000004/2026-07-01/r1` covers

|                | Supported                                                   |
| -------------- | ----------------------------------------------------------- |
| Award          | General Retail Industry Award 2020 (MA000004)               |
| Classification | Retail Employee Level 1                                     |
| Employment     | Casual and part-time                                        |
| Age            | 21 or older for the whole pay period                        |
| Shiftwork      | Non-shiftworkers only                                       |
| Agreements     | The award only, with no enterprise agreement                |
| Pay periods    | Starting on or after 1 July 2026                            |
| Time zones     | `Australia/*`                                               |
| Hours          | Ordinary hours inside the span set out in cl. 15.1, Table 2 |

## Rates in use

Percentages are of the Level 1 minimum hourly rate, $27.81 (cl. 17.1, Table 4). The casual percentages already include the 25% casual loading. Clause 11.1 sets the loading, and the casual column of Table 12 says it's "inclusive of casual loading". So the engine never adds it a second time, and a test checks that every casual rate is exactly 25 points above the part-time one.

| Rule                             | When (local time)   | Part-time     | Casual        | Source                                 |
| -------------------------------- | ------------------- | ------------- | ------------- | -------------------------------------- |
| `MA000004.ORD.WEEKDAY`           | Mon-Fri 07:00-18:00 | 100% ($27.81) | 125% ($34.76) | cl. 15.1 Table 2, cl. 11.1, Schedule B |
| `MA000004.PEN.WEEKDAY_AFTER_6PM` | Mon-Fri 18:00-21:00 | 125% ($34.76) | 150% ($41.72) | cl. 22.1 Table 12                      |
| `MA000004.PEN.SATURDAY`          | Sat 07:00-18:00     | 125% ($34.76) | 150% ($41.72) | cl. 22.1 Table 12                      |
| `MA000004.PEN.SUNDAY`            | Sun 09:00-18:00     | 150% ($41.72) | 175% ($48.67) | cl. 22.1 Table 12                      |

The dollar figures come from rounding each percentage half-up to the cent. A test checks that they match the award's published Schedule B rates exactly.

## Rates copied in but switched off

**Public holidays** (`MA000004.PH.ALL_ORDINARY`, 225% and 250%). There's no verified calendar of public holidays for each state, and cl. 22.2 lets employers and employees agree to different arrangements. A day the person marks as a public holiday comes back as "needs review".

**Overtime** (`MA000004.OT.*`, Table 11). Working out which hours are overtime depends on agreed guaranteed hours and any changes to them, the exceptions in cl. 15.2, and the ordering rules in cl. 21.2(b). Possible overtime comes back as "needs review".

## Spotted and flagged, never priced

| Issue                                  | What triggers it                                                                                   | Clauses          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------- |
| `OUTSIDE_SPAN_OF_ORDINARY_HOURS`       | Paid time outside every enabled window, such as after 9 pm on a weekday or before 9 am on a Sunday | 15.1, 15.2, 21.2 |
| `PUBLIC_HOLIDAY_NOT_SUPPORTED`         | Work on a day marked as a public holiday                                                           | 22.1, 32         |
| `MINIMUM_ENGAGEMENT_SHORTFALL`         | A shift shorter than 3 hours                                                                       | 10.9, 11.2       |
| `DAILY_ORDINARY_HOURS_EXCEEDED`        | More than 9 paid hours on one date                                                                 | 15.4, 15.5, 21.2 |
| `PART_TIME_HOURS_EXCEED_GUARANTEED`    | More paid time on a day than the guaranteed hours for that weekday                                 | 10.5, 10.6, 10.8 |
| `CASUAL_WEEKLY_HOURS_EXCEEDED`         | More than 38 paid hours in a Monday-to-Sunday week                                                 | 21.2(a)          |
| `INSUFFICIENT_BREAK_BETWEEN_WORK_DAYS` | Less than 12 hours between finishing one day and starting the next                                 | 16.6             |
| `NO_MEAL_BREAK_AFTER_FIVE_HOURS`       | More than 5 paid hours without a break (a warning only)                                            | 16.5(c)          |

Scope problems, such as an unsupported employment type, junior rates or an enterprise agreement, are listed in `packages/calculation-engine/src/issues.ts` with how serious each one is and what to do next.

## When rules overlap

If several enabled windows cover the same minute, the rule with the highest `precedence` wins and the others are recorded in `overriddenRuleIds`. Two overlapping windows with the same precedence are an error when the rule set loads. The bundled rule set has no overlaps, so precedence is tested with rule sets that exist only in the tests.

## Publishing a new version

1. Download the official consolidated award and the pay guide. Note the URL, date and SHA-256 hash in `docs/award-sources.md`.
2. Copy the latest data file to `<effective-date>.r1.json`. Update `version`, `effective` and `source`, and copy the new values in with the award's wording quoted.
3. Close off the previous version by setting its `effective.until`. That's a new revision of the old file, never an edit to it.
4. Add golden scenarios worked out from the new Schedule B rates.
5. Run `pnpm --filter @wageguard/award-rules fingerprint` and add the new fingerprint to `published-fingerprints.json`.
