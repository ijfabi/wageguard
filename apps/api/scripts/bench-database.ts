/**
 * Benchmark C measurement process (database query performance). Started by
 * `pnpm benchmark:database` (benchmarks/scripts/database.ts), which records the environment and
 * writes the report. Run with plain `node` (Node 24 strips the types): a loader such as tsx would
 * load @nestjs/core twice and break Nest's dependency injection.
 *
 *   node scripts/bench-database.ts <output.json>      (after `pnpm build`)
 *
 * Starts a throwaway PostgreSQL (Testcontainers, same image as production), applies the real
 * migrations, seeds synthetic data at increasing row counts and measures the application's own
 * data-access paths: the compiled services from a booted Nest application, so every query is the
 * one production sends. For each operation it records latencies, every SQL statement (captured at
 * the pg driver) and EXPLAIN (ANALYZE, BUFFERS) for each distinct read statement.
 *
 * Synthetic data only. The development database is never touched.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type * as Pg from "pg";

import type { PlanSummary, RawOperation, RawOutput, RawStep } from "../../../benchmarks/lib/database-raw.js";
// Type-only imports of the sources that dist/ was compiled from (erased at run time).
import type * as AppFactory from "../src/app.factory.js";
import type * as Pagination from "../src/common/pagination.js";
import type * as Config from "../src/config/config.js";
import type * as PrismaServiceModule from "../src/infrastructure/prisma.service.js";
import type * as AuditsServiceModule from "../src/modules/audits/audits.service.js";
import type * as DashboardServiceModule from "../src/modules/dashboard/dashboard.service.js";
import type * as EmploymentsServiceModule from "../src/modules/employments/employments.service.js";
import type * as PayslipsServiceModule from "../src/modules/payslips/payslips.service.js";
import type * as ShiftsServiceModule from "../src/modules/shifts/shifts.service.js";

// ---------------------------------------------------------------------------------------------
// SQL capture: every statement the application sends through node-postgres. The Prisma adapter
// loads this same `pg` module, so patching its Client prototype sees all of them.
// ---------------------------------------------------------------------------------------------

interface CapturedQuery {
  readonly text: string;
  readonly values: readonly unknown[];
}
let capture: CapturedQuery[] | null = null;

const requireFromAdapter = createRequire(createRequire(import.meta.url).resolve("@prisma/adapter-pg"));
const pg = requireFromAdapter("pg") as typeof Pg;
// eslint-disable-next-line @typescript-eslint/unbound-method -- re-applied below with the client as `this`
const originalQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function patchedQuery(this: unknown, ...args: unknown[]) {
  if (capture !== null) {
    const [config, values] = args as [string | { text: string; values?: unknown[] }, unknown[] | undefined];
    const text = typeof config === "string" ? config : config.text;
    capture.push({ text, values: (typeof config === "object" ? config.values : undefined) ?? values ?? [] });
  }
  return (originalQuery as (...a: unknown[]) => unknown).apply(this, args);
} as typeof originalQuery;

// ---------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------

const OUTPUT = process.argv[2];
if (OUTPUT === undefined) {
  throw new Error("Usage: node scripts/bench-database.ts <output.json>");
}
/** Audits (and payslips) owned by the measured user at each step. Other users hold as many each. */
const SCALES = (process.env["BENCHMARK_DB_SCALES"] ?? "100,1000,10000").split(",").map(Number);
const OTHER_USERS = 4;
/** Shifts per audit for the measured user (one fortnight of work, one shift a day). */
const SHIFTS_PER_AUDIT = 10;
const WARMUP = 5;
const ITERATIONS = 30;
const IMPORT_ITERATIONS = 20;
const IMPORT_ROWS = 14;
const POSTGRES_IMAGE = "postgres:17.6-alpine";
const API_ROOT = path.resolve(import.meta.dirname, "..");

// ---------------------------------------------------------------------------------------------
// Database and the compiled application
// ---------------------------------------------------------------------------------------------

console.log("Starting PostgreSQL...");
const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
  .withDatabase("wageguard_bench")
  .withUsername("wageguard")
  .withPassword("benchmark-only-password")
  .start();
const databaseUrl = container.getConnectionUri();
execFileSync(
  process.execPath,
  [path.join(API_ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
  { cwd: API_ROOT, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" },
);

const fromDist = async <T>(relative: string): Promise<T> =>
  (await import(pathToFileURL(path.join(API_ROOT, "dist", relative)).href)) as T;
const { createApp } = await fromDist<typeof AppFactory>("app.factory.js");
const { loadConfig } = await fromDist<typeof Config>("config/config.js");
const { PrismaService } = await fromDist<typeof PrismaServiceModule>("infrastructure/prisma.service.js");
const { AuditsService } = await fromDist<typeof AuditsServiceModule>("modules/audits/audits.service.js");
const { DashboardService } = await fromDist<typeof DashboardServiceModule>(
  "modules/dashboard/dashboard.service.js",
);
const { EmploymentsService } = await fromDist<typeof EmploymentsServiceModule>(
  "modules/employments/employments.service.js",
);
const { PayslipsService } = await fromDist<typeof PayslipsServiceModule>(
  "modules/payslips/payslips.service.js",
);
const { ShiftsService } = await fromDist<typeof ShiftsServiceModule>("modules/shifts/shifts.service.js");
const { encodeCursor } = await fromDist<typeof Pagination>("common/pagination.js");

const app = await createApp(loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl, LOG_LEVEL: "silent" }));
await app.init();
const prisma = app.get(PrismaService);
const audits = app.get(AuditsService);
const dashboard = app.get(DashboardService);
const employments = app.get(EmploymentsService);
const payslips = app.get(PayslipsService);
const shifts = app.get(ShiftsService);
const explainClient = new pg.Client({ connectionString: databaseUrl });
await explainClient.connect();
const postgresVersion = (
  (await explainClient.query("SHOW server_version")).rows[0] as { server_version: string }
).server_version;

// ---------------------------------------------------------------------------------------------
// Seeding: three real audits per user through the services (genuine snapshots), then SQL copies
// ---------------------------------------------------------------------------------------------

const EMPLOYMENT = {
  label: "Benchmark retail job",
  awardCode: "MA000004",
  classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
  employmentType: "CASUAL",
  state: "NSW",
  timeZone: "Australia/Sydney",
  declarations: {
    awardCoverage: "CONFIRMED",
    enterpriseAgreement: "NONE",
    ageBand: "ADULT_21_PLUS",
    shiftworker: "NO",
  },
} as const;
const PERIOD = { startDate: "2026-07-06", endDate: "2026-07-19" };

interface Owner {
  readonly userId: string;
  readonly employmentId: string;
  readonly templateAuditIds: readonly string[];
  readonly templatePayslipId: string;
}

/** A user with an employment and three audits: matched, underpaid and needs review. */
async function createOwner(name: string): Promise<Owner> {
  const user = await prisma.user.create({
    data: { email: `${name}@bench.example`, passwordHash: "benchmark-user-cannot-sign-in" },
  });
  const employment = await employments.create(user.id, { ...EMPLOYMENT, label: `${name} job` });
  for (const [start, end] of [
    ["2026-07-06T09:00", "2026-07-06T17:00"],
    ["2026-07-11T08:00", "2026-07-11T16:30"],
    ["2026-07-12T10:00", "2026-07-12T16:00"],
  ] as const) {
    await shifts.create(user.id, { employmentId: employment.id, start, end, breaks: [] });
  }
  const templateAuditIds: string[] = [];
  let templatePayslipId = "";
  const run = async (key: string, gross: string) => {
    const payslip = await payslips.create(user.id, {
      employmentId: employment.id,
      payPeriod: PERIOD,
      grossPay: gross,
      lines: [],
    });
    templatePayslipId = payslip.id;
    const { audit } = await audits.create(user.id, key, {
      employmentId: employment.id,
      payslipId: payslip.id,
    });
    templateAuditIds.push(audit.id);
  };
  await run("template-0", "862.15"); // MATCHED
  await run("template-1", "800.00"); // POTENTIAL_UNDERPAYMENT
  // A shift past 9 pm makes the next audit REVIEW_REQUIRED.
  await shifts.create(user.id, {
    employmentId: employment.id,
    start: "2026-07-17T17:00",
    end: "2026-07-17T22:00",
    breaks: [],
  });
  await run("template-2", "900.00");
  return { userId: user.id, employmentId: employment.id, templateAuditIds, templatePayslipId };
}

/**
 * Tops a user up to `target` audits and payslips by copying their template rows (with findings),
 * created_at spread backwards 7 minutes apart, and to `shiftsTarget` shifts (one a day, going
 * back from the template fortnight, so nothing overlaps). Bulk rows get v4 UUIDs (PostgreSQL 17
 * has no uuidv7); ordering uses (created_at, id), so only index locality differs.
 */
async function topUp(owner: Owner, target: number, shiftsTarget: number): Promise<void> {
  const current = await prisma.audit.count({ where: { userId: owner.userId } });
  const add = target - current;
  if (add > 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO payslips (id, user_id, employment_id, period_start, period_end, gross_pay, created_at)
       SELECT gen_random_uuid(), p.user_id, p.employment_id, p.period_start, p.period_end, p.gross_pay,
              now() - (g * interval '7 minutes')
       FROM payslips p, generate_series($2::int + 1, $2::int + $3::int) g
       WHERE p.id = $1::uuid`,
      owner.templatePayslipId,
      current,
      add,
    );
    await prisma.$executeRawUnsafe(
      `WITH templates AS (
         SELECT a.*, row_number() OVER (ORDER BY a.created_at, a.id) - 1 AS t
         FROM audits a WHERE a.id = ANY($1::uuid[])
       ), inserted AS (
         INSERT INTO audits (id, user_id, employment_id, payslip_id, idempotency_key, request_hash, status,
           period_start, period_end, finding_status, calculation_status, expected_amount, reported_amount,
           difference, shift_count, rule_set_version, rule_set_fingerprint, engine_version, input_hash,
           input_snapshot, payslip_snapshot, result, reconciliation, calculated_at, created_at)
         SELECT gen_random_uuid(), t.user_id, t.employment_id, t.payslip_id, 'bulk-' || t.t || '-' || g,
           t.request_hash, t.status, t.period_start, t.period_end, t.finding_status, t.calculation_status,
           t.expected_amount, t.reported_amount, t.difference, t.shift_count, t.rule_set_version,
           t.rule_set_fingerprint, t.engine_version, t.input_hash, t.input_snapshot, t.payslip_snapshot,
           t.result, t.reconciliation, t.calculated_at, now() - (g * interval '7 minutes')
         FROM generate_series($2::int + 1, $2::int + $3::int) g
         JOIN templates t ON t.t = g % 3
         RETURNING id, idempotency_key
       )
       INSERT INTO audit_findings (id, audit_id, position, code, scope, status, explanation, expected_amount,
         reported_amount, difference, shift_ids, clause_refs, evidence_refs, next_step)
       SELECT gen_random_uuid(), i.id, f.position, f.code, f.scope, f.status, f.explanation, f.expected_amount,
         f.reported_amount, f.difference, f.shift_ids, f.clause_refs, f.evidence_refs, f.next_step
       FROM inserted i
       JOIN templates t ON t.t = split_part(i.idempotency_key, '-', 2)::int
       JOIN audit_findings f ON f.audit_id = t.id`,
      owner.templateAuditIds,
      current,
      add,
    );
  }
  const currentShifts = await prisma.shift.count({ where: { userId: owner.userId } });
  const addShifts = shiftsTarget - currentShifts;
  if (addShifts > 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO shifts (id, user_id, employment_id, start_local, end_local, start_date, start_at, end_at,
         version, created_at, updated_at)
       SELECT gen_random_uuid(), $1::uuid, $2::uuid, to_char(d, 'YYYY-MM-DD') || 'T09:00',
         to_char(d, 'YYYY-MM-DD') || 'T17:00', d, (d + time '09:00') AT TIME ZONE 'Australia/Sydney',
         (d + time '17:00') AT TIME ZONE 'Australia/Sydney', 1, now(), now()
       FROM (SELECT date '2026-07-05' - g AS d FROM generate_series($3::int, $3::int + $4::int - 1) g) days`,
      owner.userId,
      owner.employmentId,
      currentShifts,
      addShifts,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------------------------

interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Actual Rows"?: number;
  Plans?: PlanNode[];
}

function walk(node: PlanNode, visit: (n: PlanNode) => void): void {
  visit(node);
  for (const child of node.Plans ?? []) {
    walk(child, visit);
  }
}

async function explain(query: CapturedQuery): Promise<PlanSummary> {
  const result = await explainClient.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`, [
    ...query.values,
  ]);
  const [doc] = (result.rows[0] as { "QUERY PLAN": unknown[] })["QUERY PLAN"] as {
    Plan: PlanNode & { "Shared Hit Blocks": number; "Shared Read Blocks": number };
    "Planning Time": number;
    "Execution Time": number;
  }[];
  if (doc === undefined) {
    throw new Error("EXPLAIN returned no plan");
  }
  const nodes: string[] = [];
  const sequentialScans: { relation: string; rows: number }[] = [];
  walk(doc.Plan, (n) => {
    const target = n["Index Name"] ?? n["Relation Name"];
    nodes.push(target === undefined ? n["Node Type"] : `${n["Node Type"]} (${target})`);
    if (n["Node Type"] === "Seq Scan" && n["Relation Name"] !== undefined) {
      sequentialScans.push({ relation: n["Relation Name"], rows: n["Actual Rows"] ?? 0 });
    }
  });
  return {
    sql: query.text.replace(/\s+/g, " ").slice(0, 500),
    planningMs: doc["Planning Time"],
    executionMs: doc["Execution Time"],
    nodes,
    sequentialScans,
    sharedBuffersHit: doc.Plan["Shared Hit Blocks"],
    sharedBuffersRead: doc.Plan["Shared Read Blocks"],
  };
}

const kindOf = (sql: string): string => /^\s*(\w+)/.exec(sql)?.[1]?.toUpperCase() ?? "OTHER";

/** Times `run`, records the SQL of its first measured call and EXPLAINs each distinct read. */
async function measure(
  operation: string,
  run: () => Promise<unknown>,
  { iterations = ITERATIONS, explainReads = true } = {},
): Promise<RawOperation> {
  for (let i = 0; i < WARMUP; i += 1) {
    await run();
  }
  const latenciesMs: number[] = [];
  let recorded: CapturedQuery[] = [];
  for (let i = 0; i < iterations; i += 1) {
    capture = [];
    const started = performance.now();
    await run();
    latenciesMs.push(performance.now() - started);
    if (i === 0) {
      recorded = capture;
    }
    capture = null;
  }
  const statementKinds: Record<string, number> = {};
  for (const q of recorded) {
    const kind = kindOf(q.text);
    statementKinds[kind] = (statementKinds[kind] ?? 0) + 1;
  }
  const distinct = [
    ...new Map(recorded.filter((q) => kindOf(q.text) === "SELECT").map((q) => [q.text, q])).values(),
  ];
  const plans: PlanSummary[] = [];
  if (explainReads) {
    for (const query of distinct) {
      plans.push(await explain(query));
    }
  }
  return { operation, latenciesMs, queryCount: recorded.length, statementKinds, plans };
}

let importFortnight = 0;
/** A fortnight of shifts from 2028 onwards, after every seeded shift, so imports never overlap. */
function nextImportCsv(): string {
  const lines = ["start,end,meal_start,meal_end"];
  const base = Date.UTC(2028, 0, 3) + importFortnight * 14 * 86_400_000;
  importFortnight += 1;
  for (let d = 0; d < IMPORT_ROWS; d += 1) {
    const day = new Date(base + d * 86_400_000).toISOString().slice(0, 10);
    lines.push(`${day}T09:00,${day}T17:00,${day}T12:00,${day}T12:30`);
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

console.log("Creating users and template audits...");
const target = await createOwner("measured");
const others: Owner[] = [];
for (let i = 0; i < OTHER_USERS; i += 1) {
  others.push(await createOwner(`other-${i}`));
}

const steps: RawStep[] = [];
for (const scale of SCALES) {
  console.log(`Seeding to ${scale} audits for the measured user...`);
  const seedStarted = performance.now();
  await topUp(target, scale, scale * SHIFTS_PER_AUDIT);
  for (const other of others) {
    await topUp(other, scale, scale);
  }
  await explainClient.query("VACUUM ANALYZE");
  const seedSeconds = (performance.now() - seedStarted) / 1000;
  const counts = (
    await explainClient.query(
      `SELECT (SELECT count(*) FROM audits)::int AS audits, (SELECT count(*) FROM audit_findings)::int AS findings,
              (SELECT count(*) FROM shifts)::int AS shifts, (SELECT count(*) FROM payslips)::int AS payslips,
              pg_database_size(current_database())::float8 AS bytes`,
    )
  ).rows[0] as RawStep["rows"];

  const [middle] = await prisma.audit.findMany({
    where: { userId: target.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: Math.floor(scale / 2),
    take: 1,
    select: { id: true, createdAt: true },
  });
  const deepCursor =
    middle === undefined ? undefined : encodeCursor({ k: middle.createdAt.toISOString(), id: middle.id });
  const detailId = target.templateAuditIds[1] as string;

  console.log(`Measuring at ${scale}...`);
  const operations: RawOperation[] = [];
  operations.push(
    await measure("Audit history, first page (20)", () =>
      audits.list(target.userId, { limit: 20, sort: "created_desc" }),
    ),
  );
  operations.push(
    await measure("Audit history, page at the midpoint (keyset)", () =>
      audits.list(target.userId, {
        limit: 20,
        sort: "created_desc",
        ...(deepCursor === undefined ? {} : { cursor: deepCursor }),
      }),
    ),
  );
  operations.push(
    await measure("Audit history filtered by status", () =>
      audits.list(target.userId, {
        limit: 20,
        sort: "created_desc",
        findingStatus: "POTENTIAL_UNDERPAYMENT",
      }),
    ),
  );
  operations.push(await measure("Audit detail with findings", () => audits.get(target.userId, detailId)));
  operations.push(await measure("Dashboard summary", () => dashboard.summary(target.userId)));
  operations.push(
    await measure("Payslip history, first page (20)", () => payslips.list(target.userId, { limit: 20 })),
  );
  operations.push(
    await measure("Shift list for an employment (20)", () =>
      shifts.list(target.userId, { employmentId: target.employmentId, limit: 20, sort: "start_desc" }),
    ),
  );
  operations.push(
    await measure(
      `Shift CSV import (${IMPORT_ROWS} rows with meal breaks)`,
      () => shifts.importCsv(target.userId, target.employmentId, nextImportCsv()),
      { iterations: IMPORT_ITERATIONS, explainReads: false },
    ),
  );
  steps.push({ measuredUserAudits: scale, rows: counts, seedSeconds, operations });
}

const output: RawOutput = {
  postgresVersion,
  configuration: {
    scales: SCALES,
    otherUsers: OTHER_USERS,
    otherUserAuditsEach: "same as the measured user",
    shiftsPerAuditForMeasuredUser: SHIFTS_PER_AUDIT,
    otherUserShiftsEach: "one per audit",
    warmupIterations: WARMUP,
    measuredIterations: ITERATIONS,
    importIterations: IMPORT_ITERATIONS,
    importRows: IMPORT_ROWS,
    postgresImage: POSTGRES_IMAGE,
  },
  steps,
};
writeFileSync(OUTPUT, JSON.stringify(output));
await explainClient.end();
await app.close();
await container.stop();
console.log(`Wrote ${OUTPUT}`);
