# Rules engine

## Supported scope (rule set `MA000004/2026-07-01/r1`)

| Dimension       | Supported                                                   |
| --------------- | ----------------------------------------------------------- |
| Award           | General Retail Industry Award 2020 (MA000004)               |
| Classification  | Retail Employee Level 1                                     |
| Employment type | Casual, part-time                                           |
| Age             | Adults (21 or older) for the whole period                   |
| Shiftwork       | Non-shiftworkers only                                       |
| Instrument      | Award only; no enterprise agreement                         |
| Pay periods     | Starting on or after 2026-07-01                             |
| Time zones      | `Australia/*` IANA zones                                    |
| Hours           | Ordinary hours inside the span of hours in cl. 15.1 Table 2 |

## Enabled rules

Percentages are of the Level 1 minimum hourly rate ($27.81, cl. 17.1 Table 4). Casual percentages already include the 25% casual loading (cl. 11.1; Table 12 column 3 is stated "inclusive of casual loading"). The engine never adds the loading again, and a test asserts that casual = part-time + 25 points for every rule.

| Rule id                          | When (local time)   | Part-time     | Casual        | Source                               |
| -------------------------------- | ------------------- | ------------- | ------------- | ------------------------------------ |
| `MA000004.ORD.WEEKDAY`           | Mon-Fri 07:00-18:00 | 100% ($27.81) | 125% ($34.76) | cl. 15.1 Table 2, cl. 11.1, Sched. B |
| `MA000004.PEN.WEEKDAY_AFTER_6PM` | Mon-Fri 18:00-21:00 | 125% ($34.76) | 150% ($41.72) | cl. 22.1 Table 12                    |
| `MA000004.PEN.SATURDAY`          | Sat 07:00-18:00     | 125% ($34.76) | 150% ($41.72) | cl. 22.1 Table 12                    |
| `MA000004.PEN.SUNDAY`            | Sun 09:00-18:00     | 150% ($41.72) | 175% ($48.67) | cl. 22.1 Table 12                    |

Dollar rates are derived by rounding half-up to cents, and they equal the award's published Schedule B values (tested).

## Transcribed but disabled

| Rule id                                  | Why disabled                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MA000004.PH.ALL_ORDINARY` (225% / 250%) | There is no verified state public holiday calendar, and cl. 22.2 allows alternative arrangements. Declared holidays return `REVIEW_REQUIRED`.                    |
| `MA000004.OT.*` (Table 11)               | Overtime attribution needs guaranteed-hour agreements and variations, cl. 15.2 exceptions and cl. 21.2(b) ordering. Possible overtime returns `REVIEW_REQUIRED`. |

## Detected and flagged, never calculated

| Issue code                             | Trigger                                                                                                | Clauses          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| `OUTSIDE_SPAN_OF_ORDINARY_HOURS`       | Paid time outside every enabled window, for example after 9 pm on a weekday or before 9 am on a Sunday | 15.1, 15.2, 21.2 |
| `PUBLIC_HOLIDAY_NOT_SUPPORTED`         | Work on a declared public holiday                                                                      | 22.1, 32         |
| `MINIMUM_ENGAGEMENT_SHORTFALL`         | Shift shorter than 3 hours                                                                             | 10.9, 11.2       |
| `DAILY_ORDINARY_HOURS_EXCEEDED`        | More than 540 paid minutes on a local date                                                             | 15.4, 15.5, 21.2 |
| `PART_TIME_HOURS_EXCEED_GUARANTEED`    | Paid minutes on a date above the guaranteed minutes for that weekday                                   | 10.5, 10.6, 10.8 |
| `CASUAL_WEEKLY_HOURS_EXCEEDED`         | More than 2,280 paid minutes in a Monday-Sunday week                                                   | 21.2(a)          |
| `INSUFFICIENT_BREAK_BETWEEN_WORK_DAYS` | Less than 720 minutes between finishing on one day and starting on the next                            | 16.6             |
| `NO_MEAL_BREAK_AFTER_FIVE_HOURS`       | More than 300 continuous paid minutes (warning only)                                                   | 16.5(c)          |

Scope issues (`EMPLOYMENT_TYPE_NOT_SUPPORTED`, `JUNIOR_RATES_NOT_SUPPORTED`, `ENTERPRISE_AGREEMENT_APPLIES` and others) are listed in `packages/calculation-engine/src/issues.ts` with their severities and next steps.

## Precedence

When several enabled windows contain the same minute, the rule with the highest `precedence` wins and the others are recorded as `overriddenRuleIds`. Two overlapping windows with equal precedence are rejected when the rule set loads. The bundled rule set has no overlapping windows; precedence is exercised by test-only rule sets.

## Adding a rule set version

1. Retrieve the official consolidated award and pay guide. Record the URL, retrieval date and SHA-256 in `docs/award-sources.md`.
2. Copy the latest data file to a new `<effective-date>.r1.json`, update `version`, `effective` and `source`, and transcribe values with verbatim excerpts.
3. Set the previous version's `effective.until`. That is a new revision of it, never an edit in place.
4. Add golden scenarios derived from the new Schedule B values.
5. Run `pnpm --filter @wageguard/award-rules fingerprint` and record the new fingerprint in `published-fingerprints.json`.
