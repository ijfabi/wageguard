# Suggested resume bullets

Generated from measured evidence only. Edit wording freely, but keep the qualifiers ("synthetic", "defined supported scenario set") and do not change the numbers.

- Engineered a deterministic TypeScript payroll calculation engine (exact decimal arithmetic, DST-aware time segmentation, versioned award rules) that processed a median 32,588 synthetic shifts per second in an isolated, documented single-process benchmark.  
  _Evidence: benchmarks/results/engine-2026-10-22T12-01-59-466Z-3bf2ea.json_
- Profiled the calculation engine, identified time-zone offset lookups as the dominant cost, and replaced them with cached per-year transition tables, cutting median runtime on a 10,000-shift synthetic workload by 85.3% with byte-identical outputs verified by digest.  
  _Evidence: benchmarks/results/engine-2026-10-22T11-33-22-878Z-91c72e.json (baseline) vs benchmarks/results/engine-2026-10-22T12-01-59-466Z-3bf2ea.json (optimised); equivalence benchmarks/results/equivalence-2026-10-22T11-40-08-075Z-5716ab.json_
- Built a golden evaluation suite of payroll scenarios derived from the General Retail Industry Award's published rates; the engine matches 10/10 hand-derived reference calculations in the defined supported scope and correctly refuses 11/11 out-of-scope or review-required cases rather than guessing (expected values not yet reviewed by a payroll professional).  
  _Evidence: benchmarks/results/correctness-2026-10-22T12-59-18-696Z-463d67.json_
- Wrote 350 automated unit, property-based (fast-check), golden and PostgreSQL-backed API integration tests, reaching 93.12% branch coverage on the pure calculation engine.  
  _Evidence: benchmarks/test-reports/api-contracts.json, benchmarks/test-reports/api.json, benchmarks/test-reports/award-rules.json, benchmarks/test-reports/calculation-engine.json, benchmarks/test-reports/domain.json, benchmarks/test-reports/presentation.json, benchmarks/test-reports/test-fixtures.json, benchmarks/test-reports/web.json; benchmarks/results/correctness-2026-10-22T12-59-18-696Z-463d67.json_
- Profiled the API's PostgreSQL access with EXPLAIN ANALYZE and driver-level query counts on 50,000 synthetic audits, then cut median audit-history latency by 77.6% (stopped loading unused JSON snapshots), dashboard latency by 62.3% (covering index replacing two sequential scans) and CSV import latency by 78.5% (60 -> 6 SQL statements per 14-row import).  
  _Evidence: benchmarks/results/database-2026-10-24T15-15-53-196Z-48304d.json_
- Load-tested the audit API with k6 at 1 to 50 concurrent clients against the production container image; the query optimisations raised throughput at 50 clients by 54.9% and cut p95 latency by 29.6% on an identical workload, with 0% errors (single-workstation test).  
  _Evidence: benchmarks/results/api-2026-10-24T15-23-43-912Z-8815c8.json_
- Designed idempotent audit submission (unique Idempotency-Key per request, database-enforced) and verified it with failure injection: 100% of 14,999 audit submissions completed while the API process was killed mid-load and while PostgreSQL was down for 10 s, with 0 duplicate, lost or inconsistent records.  
  _Evidence: benchmarks/results/reliability-2026-10-24T15-49-32-351Z-b942b0.json_

Do not claim: real users or customers, money recovered, production uptime or scale, AWS capacity, or legal accuracy across Australian payroll.
