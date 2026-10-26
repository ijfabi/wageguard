# Rules engine

## Rule sets

Two rule sets are published for pay periods from 1 July 2026. Both are frozen and fingerprinted.

- `MA000004/2026-07-01/r1` priced Level 1 adults on casual and part-time contracts, inside the ordinary span, and flagged everything else for review.
- `MA000004/2026-07-01/r2` supersedes r1 for the same pay periods. It was transcribed from the same award text and adds everything below.

A pay period resolves to the newest revision that covers it, so new audits use r2. Audits already saved keep the rule set, fingerprint and engine version they were calculated with, and their reports can always be rebuilt ([ADR 0003](adr/0003-versioned-immutable-rule-sets.md)).

## What r2 covers

|                | Supported                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Award          | General Retail Industry Award 2020 (MA000004)                                                                  |
| Classification | Retail Employee Levels 1 to 8 (Schedule A)                                                                     |
| Employment     | Full-time, part-time and casual                                                                                |
| Age            | Adults, and juniors by their age on each day worked (cl. 17.2), including the age-20 rule on length of service |
| Shiftwork      | Shiftworkers other than baking production (cl. 24.1, 25.1)                                                     |
| Agreements     | The award only, with no enterprise agreement                                                                   |
| Pay periods    | Starting on or after 1 July 2026                                                                               |
| Time zones     | `Australia/*`                                                                                                  |

## Rates

Percentages are of the minimum hourly rate for the classification (cl. 17.1, Table 4). Casual percentages already include the 25% casual loading (cl. 11.1), so the engine never adds it a second time. A test reproduces every dollar rate in Schedule B.1 to B.3, for every level, age band and employment type, and checks each rule's percentage against the column headings of those tables.

| Rule                                | When                                          | Full-time and part-time | Casual           | Clauses       |
| ----------------------------------- | --------------------------------------------- | ----------------------- | ---------------- | ------------- |
| `MA000004.ORD.WEEKDAY`              | Mon-Fri 7 am to 6 pm                          | 100%                    | 125%             | 15.1, 11.1    |
| `MA000004.PEN.WEEKDAY_AFTER_6PM`    | Mon-Fri 6 pm to 9 pm                          | 125%                    | 150%             | 22.1          |
| `MA000004.PEN.SATURDAY`             | Saturday 7 am to 6 pm                         | 125%                    | 150%             | 22.1          |
| `MA000004.PEN.SUNDAY`               | Sunday 9 am to 6 pm                           | 150%                    | 175%             | 22.1          |
| `MA000004.PH.ALL_ORDINARY`          | Ordinary hours on a public holiday            | 225%                    | 250%             | 22.1, 33      |
| `MA000004.OT.MON_SAT_FIRST_3H`      | First 3 hours of overtime, Monday to Saturday | 150%                    | 175%             | 21.2 Table 11 |
| `MA000004.OT.MON_SAT_AFTER_3H`      | Later overtime, Monday to Saturday            | 200%                    | 225%             | 21.2 Table 11 |
| `MA000004.OT.SUNDAY`                | Overtime on Sunday                            | 200%                    | 225%             | 21.2 Table 11 |
| `MA000004.OT.PUBLIC_HOLIDAY`        | Overtime on a public holiday                  | 250%                    | 275%             | 21.2 Table 11 |
| `MA000004.SHIFT.*`                  | Shiftwork Mon-Fri, Saturday, Sunday           | 130%, 150%, 175%        | 155%, 175%, 200% | 25.1          |
| `MA000004.BREAK.LESS_THAN_12_HOURS` | Work before a break of less than 12 hours     | 200%                    | 225%             | 16.6(b)       |

The cl. 15.2 exceptions add their own windows: ordinary hours from 5 am in a newsagency, until midnight in a video shop, and until 11 pm where the store trades late. Each applies only to an employment that has that exception.

Allowances (cl. 19) are priced from the employment's answers and the claims entered with an audit: laundry ($6.42 a week full-time, $1.28 a shift otherwise), cold work ($0.38 an hour, plus $0.59 below 0°C), first aid ($14.55 a week), liquor licence ($34.69 a week), Broken Hill ($1.26 an hour), motor vehicle ($1.00 a kilometre) and meal allowances ($24.56, and $22.27 more after 4 hours). Paid leave is priced at the base rate, with annual leave loading at the 17.5% minimum (cl. 28.3).

## How hours are classified

1. Paid time is split at midnight, at every rule window boundary, at the start of each public holiday (part-day holidays start at their listed time) and around unpaid meal breaks.
2. Time outside every window for the employment is overtime (cl. 21.2).
3. Daily and weekly limits come next: more than 9 ordinary hours in a day (11 on one day a week, cl. 15.5), part-time hours beyond the guaranteed hours for that day unless varied in writing (cl. 10.6), and more than 38 ordinary hours in a Monday-to-Sunday week. Shifts from the 13 days before the pay period count towards the week. The last hours worked become the overtime.
4. Overtime is priced on a daily basis: the first 3 hours each Monday to Saturday at the first rate, then the second rate (cl. 21.2(b)).
5. Shifts shorter than the 3-hour minimum engagement are topped up at the rate of their last minute (1.5 hours for a casual school student after school, cl. 11.3).
6. Work starting less than 12 hours (10 by agreement) after the previous day's finish is paid at the break rate until a full break is taken (cl. 16.6).

## What still needs review

| Issue                              | What triggers it                                              | Clauses          |
| ---------------------------------- | ------------------------------------------------------------- | ---------------- |
| `AVERAGING_ROSTER_WEEKLY_HOURS`    | A week over 38 hours when hours average over a roster cycle   | 15.6(g), 21.2(a) |
| `AGE_UNCONFIRMED`                  | "Not sure" whether adult rates applied, with no date of birth | 17.2             |
| `AWARD_COVERAGE_UNCONFIRMED`       | "Not sure" whether the award covers the job                   |                  |
| `ENTERPRISE_AGREEMENT_UNCONFIRMED` | "Not sure" whether an enterprise agreement applies            |                  |
| `SHIFTWORKER_STATUS_UNCONFIRMED`   | "Not sure" whether employed to do shiftwork                   | 23               |

Apprentices, baking production and enterprise agreements come back as "not supported", and a junior without a date of birth as incomplete. Informational notes, such as `OVERTIME_CALCULATED`, `PUBLIC_HOLIDAY_RATE_APPLIED` or `NO_PAID_REST_BREAK_RECORDED`, don't change the result. The full list, with what to do about each, is in `packages/calculation-engine/src/issues.ts`.

## When rules overlap

If several enabled windows cover the same minute, the rule with the highest `precedence` wins and the others are recorded in `overriddenRuleIds`. Two overlapping windows with the same precedence are an error when the rule set loads. Windows for different span exceptions may cover the same minutes, because no employment has two exceptions at once, and validation allows for that. Precedence is tested with rule sets that exist only in the tests.

## Publishing a new version

1. Download the official consolidated award and the pay guide. Note the URL, date and SHA-256 hash in `docs/award-sources.md`.
2. Copy the latest data file to `<effective-date>.r<n>.json`. Update `version`, `effective` and `source`, and copy the new values in with the award's wording quoted. A correction for the same dates is a new revision that names the one it `supersedes`.
3. Close off the previous version by setting its `effective.until`. That's a new revision of the old file, never an edit to it.
4. Add golden scenarios worked out from the new Schedule B rates.
5. Run `pnpm --filter @wageguard/award-rules fingerprint` and add the new fingerprint to `published-fingerprints.json`.
