# ADR 0014: PDF evidence report rendered from the immutable snapshot

- Status: Accepted
- Date: 2026-10-23

## Context

Users need something they can print or send to an employer or adviser. The JSON report is complete but machine-oriented. A PDF must say exactly what the audit said, with no recalculation, no new wording that could overstate a finding, and no outside services.

## Decision

- **Server-side rendering with pdfkit.** `GET /audits/:id/report/pdf` renders an A4 PDF in the API process.
  - pdfkit has no browser or native dependencies, so the runtime image stays small and can be scanned.
  - It is deterministic for a given input.
- **Only the stored snapshot.** The renderer is a pure function of the audit's immutable snapshot (result, reconciliation, payslip as entered) plus an injected "generated at" time.
  - It never re-runs the engine and never reads the clock.
  - The same audit always produces the same document text, which an integration test asserts.
- **Shared wording.** Headline amounts and status labels come from `@wageguard/presentation`, the same functions the web app uses. Both surfaces therefore say the same thing.
  - For example, a partial calculation's surplus is "Not a verified overpayment", and its shortfall is still a lower-bound underpayment.
  - There is no green "pass" colour.
- **Contents:**
  - result and next step;
  - amounts;
  - findings with clause references;
  - calculated pay lines;
  - the payslip as entered;
  - each shift;
  - assumptions;
  - provenance: rule-set version and fingerprint, source, engine version, input hash, calculation time in the award's time zone;
  - the disclaimer.
- **Transport and events.** The response is sent with `Cache-Control: no-store` and `Content-Disposition: attachment`. A `REPORT_EXPORTED` event is recorded with the format.

## Alternatives considered

- **Headless Chromium printing the web page.** Rejected: it adds a large browser to the image (attack surface and CVEs) and couples the report to client rendering.
- **Client-side PDF generation.** Rejected: the report would no longer be produced from the server-held snapshot.

## Consequences

- **Character range.** The standard PDF fonts (Helvetica) only cover Windows-1252. Other characters in user-entered text become "?" instead of drawing the wrong glyph. Embedding a Unicode font is a follow-up.
- **Accessibility.** The PDF is not tagged, so it is not accessible to screen readers. The accessible version of the same content is the audit and explanation pages in the web app.
