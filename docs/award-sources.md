# Award sources

## Retrieved documents

| Document                                                                                                                                                     | URL                                                                                     | Retrieved  | SHA-256 of retrieved bytes                                         | Used for                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| General Retail Industry Award 2020 [MA000004], consolidated, "incorporates all amendments up to and including 1 July 2026 (PR799280, PR799285 and PR799443)" | https://awards.fairwork.gov.au/MA000004.html                                            | 2026-10-22 | `688bd46a5fbd7bbfddcdb66c50968d8018be9b0ffcd2939fcf849a80bcb62824` | All values in rule set `MA000004/2026-07-01/r1`    |
| Fair Work Ombudsman pay guide, MA000004                                                                                                                      | https://calculate.fairwork.gov.au/Download/AwardSummary?awardCode=ma000004&fileType=pdf | 2026-10-22 | `ec301b4e432e27f714bfeebcd973134be99364cf1cb071570f6ad43b112dfc39` | Retained for future cross-checking; not yet parsed |

Full copies are kept locally under `docs/award-sources/MA000004/` and are git-ignored (Commonwealth copyright). The hashes above let anyone check that a re-download matches what was relied on. The FWC PDF (`https://www.fwc.gov.au/documents/modern_awards/pdf/ma000004.pdf`) returned HTTP 403 to automated retrieval, so it was not used.

## How values were verified

1. The HTML award was downloaded and converted to text. The clauses relied on (2, 10.5-10.9, 11.1-11.3, 15.1-15.5, 16.2-16.6, 17.1 Table 4, 21.2 Table 11, 22.1 Table 12, Schedule B.1.1 and B.2.1) were read directly. Each rule's `sources[].excerpt` quotes them verbatim.
2. Rates are cross-checked automatically. Rounding $27.81 × {125, 150, 175, 225, 250}% half-up to cents reproduces the Schedule B published values $34.76, $41.72, $48.67, $62.57 and $69.53 (`packages/domain/test/money.test.ts`).
3. Golden scenario expectations were computed by hand from Schedule B dollar rates (`packages/test-fixtures/src/golden/scenarios.ts`).

## Not yet done (honest status)

- **No human review.** No qualified payroll or legal professional has reviewed the transcription or the golden scenarios (`humanReview: PENDING` everywhere).
- **No Fair Work Pay Calculator cross-check.** The golden scenarios have not been checked against https://calculate.fairwork.gov.au/.
- **No historical rule sets.** Pay periods starting before 2026-07-01 return `UNSUPPORTED_SCENARIO`.
- **Search results not used.** A web search summary returned figures inconsistent with the award text (for example $33.19 as a Level 1 rate), so it was discarded. Only the primary document was used.
