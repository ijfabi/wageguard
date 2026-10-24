# Award sources

## Where the numbers came from

| Document                                                                                                                                                     | URL                                                                                     | Retrieved  | SHA-256 of the downloaded file                                     | Used for                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| General Retail Industry Award 2020 [MA000004], consolidated, "incorporates all amendments up to and including 1 July 2026 (PR799280, PR799285 and PR799443)" | https://awards.fairwork.gov.au/MA000004.html                                            | 2026-10-22 | `688bd46a5fbd7bbfddcdb66c50968d8018be9b0ffcd2939fcf849a80bcb62824` | Every value in rule set `MA000004/2026-07-01/r1` |
| Fair Work Ombudsman pay guide, MA000004                                                                                                                      | https://calculate.fairwork.gov.au/Download/AwardSummary?awardCode=ma000004&fileType=pdf | 2026-10-22 | `ec301b4e432e27f714bfeebcd973134be99364cf1cb071570f6ad43b112dfc39` | Kept for a future cross-check. Not read yet      |

The downloaded copies are kept locally under `docs/award-sources/MA000004/` but not committed, because they're Commonwealth copyright. Anyone can download them again and compare the hashes. The Fair Work Commission's PDF of the award (`https://www.fwc.gov.au/documents/modern_awards/pdf/ma000004.pdf`) refused the automated download with HTTP 403, so it wasn't used.

## How the values were checked

1. The award was downloaded as HTML, converted to text, and the clauses used were read directly: 2, 10.5 to 10.9, 11.1 to 11.3, 15.1 to 15.5, 16.2 to 16.6, 17.1 Table 4, 21.2 Table 11, 22.1 Table 12, and Schedule B.1.1 and B.2.1. Each rule quotes its clause word for word in `sources[].excerpt`.
2. A test checks the rates against the award's own published figures. Rounding $27.81 × 125%, 150%, 175%, 225% and 250% half-up to the cent gives $34.76, $41.72, $48.67, $62.57 and $69.53, which are exactly the Schedule B values (`packages/domain/test/money.test.ts`).
3. The golden scenarios were worked out by hand from the Schedule B dollar rates (`packages/test-fixtures/src/golden/scenarios.ts`).

## Still to do

- Nobody with payroll or legal qualifications has reviewed the transcription or the golden scenarios yet. Every scenario is still marked `humanReview: PENDING`.
- The golden scenarios haven't been compared with the Fair Work Pay Calculator at https://calculate.fairwork.gov.au/.
- There are no rule sets for earlier periods, so pay periods starting before 1 July 2026 come back as not supported.
- One web search summary gave figures that didn't match the award text (for example $33.19 as the Level 1 rate). It was ignored, and only the award itself was used.
