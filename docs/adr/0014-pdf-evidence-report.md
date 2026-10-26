# ADR 0014: The PDF report is built from the stored audit and nothing else

- Status: Accepted
- Date: 2026-10-23

## Context

People need something they can print or send to an employer or adviser. The JSON report is complete, but it's meant for machines. A PDF has to say exactly what the audit said. It can't recalculate anything, use new wording that might overstate a finding, or depend on outside services.

## Decision

`GET /audits/:id/report/pdf` renders an A4 PDF with pdfkit, inside the API process. pdfkit doesn't need a browser or native libraries, so the runtime image stays small and easy to scan, and it produces the same output for the same input.

The renderer is a pure function of the stored audit (the result, the reconciliation and the payslip as it was entered) plus the time the report was generated, which is passed in. It never runs the engine again and never reads the clock, so the same audit always produces the same text. An integration test checks that.

The headline amounts and status labels come from `@wageguard/presentation`, the same functions the web app uses, so the two always say the same thing. For example, when only some shifts could be priced, extra pay is described as "Not a verified overpayment", while a shortfall still counts as a possible underpayment. There's no green "pass" colour.

The report contains the result and suggested next step, the amounts, the findings with their award clauses, the calculated pay lines, the payslip as entered, every shift and the assumptions made. It ends with where the figures came from (the rule-set version and fingerprint, the source document, the engine version, the input hash, and when it was calculated in the award's time zone) and the disclaimer. It's sent with `Cache-Control: no-store` as a download, and each export is recorded as a `REPORT_EXPORTED` event.

## Alternatives considered

Printing the web page with headless Chromium would put a whole browser in the image, with the attack surface and security updates that brings, and tie the report to the web app's rendering. Generating the PDF in the browser would mean the report no longer came from the copy of the audit the server holds.

## Consequences

The report first used the standard PDF font (Helvetica), which only covers the Western European character set. It now embeds DejaVu Sans (subsetted by pdfkit), which also covers Latin Extended, Greek, Cyrillic, Hebrew and several other scripts. Text is checked against the font's own glyph table, so a character it can't draw, such as Chinese or an emoji, prints as "?" rather than an empty box. Right-to-left text isn't reordered.

The PDF isn't tagged for screen readers. The accessible version of the same content is the audit and explanation pages in the web app.
