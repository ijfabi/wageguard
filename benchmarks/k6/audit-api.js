// Benchmark B: audit API load (k6). Run through `pnpm benchmark:api`, which starts the isolated
// stack in docker-compose.yml, runs this script and analyses the raw data points (--out json).
//
// Model: closed (a fixed number of virtual users, each sending its next request as soon as the
// previous one completes; no think time), so each level measures capacity at that concurrency.
// Levels run one after another: a warm-up phase (discarded) then a measured phase.
//
// Each virtual user acts as one of USERS synthetic accounts seeded in setup(), and cycles through
// a fixed 20-request pattern: 30% dashboard, 25% audit history, 20% audit detail, 10% audit lines
// and 15% audit creation (full calculation, reconciliation and immutable snapshot).
/* global __ENV -- provided by the k6 runtime */
import exec from "k6/execution";
import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.API_URL || "http://api:3001/api/v1";
const ORIGIN = "http://localhost:3000";
const LEVELS = (__ENV.LEVELS || "1,10,25,50").split(",").map(Number);
const WARMUP_SECONDS = Number(__ENV.WARMUP_SECONDS || 10);
const MEASURE_SECONDS = Number(__ENV.MEASURE_SECONDS || 60);
const GRACE_SECONDS = 5;
const USERS = Math.max(...LEVELS);
const PASSWORD = "benchmark only passphrase";

/** Fixed request pattern (20 slots): the mix is exact and identical for every virtual user. */
const PATTERN = [
  ...Array(6).fill("dashboard"),
  ...Array(5).fill("audit_list"),
  ...Array(4).fill("audit_detail"),
  ...Array(2).fill("audit_lines"),
  ...Array(3).fill("audit_create"),
];
// Interleave so consecutive requests differ (deterministic order).
const ORDER = [0, 6, 11, 17, 1, 7, 15, 12, 2, 18, 8, 13, 3, 16, 9, 19, 4, 14, 10, 5].map((i) => PATTERN[i]);

function buildScenarios() {
  const scenarios = {};
  let start = 0;
  for (const level of LEVELS) {
    scenarios[`warm_${level}`] = {
      executor: "constant-vus",
      vus: level,
      duration: `${WARMUP_SECONDS}s`,
      startTime: `${start}s`,
      gracefulStop: `${GRACE_SECONDS}s`,
      exec: "run",
    };
    start += WARMUP_SECONDS + GRACE_SECONDS;
    scenarios[`run_${level}`] = {
      executor: "constant-vus",
      vus: level,
      duration: `${MEASURE_SECONDS}s`,
      startTime: `${start}s`,
      gracefulStop: `${GRACE_SECONDS}s`,
      exec: "run",
    };
    start += MEASURE_SECONDS + GRACE_SECONDS;
  }
  return scenarios;
}

export const options = {
  scenarios: buildScenarios(),
  setupTimeout: "600s",
  discardResponseBodies: false,
  // Only the tags the analysis needs, to keep the raw output small.
  systemTags: ["status", "scenario", "expected_response", "check", "name"],
};

const G009_CSV = [
  "start,end,meal_start,meal_end",
  "2026-07-06T09:00,2026-07-06T17:00,2026-07-06T12:00,2026-07-06T12:30",
  "2026-07-08T09:00,2026-07-08T14:00,,",
  "2026-07-11T08:00,2026-07-11T16:30,2026-07-11T12:00,2026-07-11T12:30",
  "2026-07-12T10:00,2026-07-12T16:00,2026-07-12T13:00,2026-07-12T13:30",
  "2026-07-14T16:00,2026-07-14T21:00,,",
  "2026-07-16T09:00,2026-07-16T15:00,2026-07-16T12:00,2026-07-16T12:30",
  "",
].join("\n");

function headers(cookie, extra = {}) {
  return { headers: { Cookie: cookie, Origin: ORIGIN, "Content-Type": "application/json", ...extra } };
}

function mustSucceed(res, label) {
  if (res.status >= 300) {
    throw new Error(`setup ${label} failed: ${res.status} ${res.body}`);
  }
  return res;
}

/** One synthetic account per virtual user: employment, a fortnight of shifts, a payslip, an audit. */
export function setup() {
  const run = Date.now();
  const users = [];
  for (let u = 0; u < USERS; u += 1) {
    const email = `bench-${run}-${u}@bench.example`;
    const reg = mustSucceed(
      http.post(`${BASE}/auth/register`, JSON.stringify({ email, password: PASSWORD }), headers(""), {
        tags: { name: "setup" },
      }),
      "register",
    );
    const setCookie = reg.headers["Set-Cookie"] || "";
    const cookie = setCookie.split(";")[0];
    const employment = mustSucceed(
      http.post(
        `${BASE}/employments`,
        JSON.stringify({
          label: `Benchmark job ${u}`,
          awardCode: "MA000004",
          classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
          employmentType: "CASUAL",
          timeZone: "Australia/Sydney",
          declarations: {
            awardCoverage: "CONFIRMED",
            enterpriseAgreement: "NONE",
            ageBand: "ADULT_21_PLUS",
            shiftworker: "NO",
          },
        }),
        headers(cookie),
        { tags: { name: "setup" } },
      ),
      "employment",
    ).json("id");
    mustSucceed(
      http.post(`${BASE}/shifts/import?employmentId=${employment}`, G009_CSV, {
        headers: { Cookie: cookie, Origin: ORIGIN, "Content-Type": "text/csv" },
        tags: { name: "setup" },
      }),
      "import",
    );
    const payslip = mustSucceed(
      http.post(
        `${BASE}/payslips`,
        JSON.stringify({
          employmentId: employment,
          payPeriod: { startDate: "2026-07-06", endDate: "2026-07-19" },
          grossPay: u % 2 === 0 ? "1100.00" : "1000.00",
          lines: [],
        }),
        headers(cookie),
        { tags: { name: "setup" } },
      ),
      "payslip",
    ).json("id");
    const audit = mustSucceed(
      http.post(`${BASE}/audits`, JSON.stringify({ employmentId: employment, payslipId: payslip }), {
        ...headers(cookie, { "Idempotency-Key": `setup-${run}-${u}` }),
        tags: { name: "setup" },
      }),
      "audit",
    ).json("id");
    users.push({ cookie, employment, payslip, audit });
  }
  return { users };
}

let slot = 0;
let latestAudit = null;

export function run(data) {
  const user = data.users[(exec.vu.idInTest - 1) % data.users.length];
  const kind = ORDER[slot % ORDER.length];
  slot += 1;
  const auditId = latestAudit || user.audit;
  const params = (name, extra = {}) => ({ ...headers(user.cookie, extra), tags: { name } });

  switch (kind) {
    case "dashboard": {
      const res = http.get(`${BASE}/dashboard`, params(kind));
      check(res, { "ok dashboard": (r) => r.status === 200 && r.json("totals") !== undefined });
      break;
    }
    case "audit_list": {
      const res = http.get(`${BASE}/audits?limit=20`, params(kind));
      check(res, { "ok audit_list": (r) => r.status === 200 && Array.isArray(r.json("items")) });
      break;
    }
    case "audit_detail": {
      const res = http.get(`${BASE}/audits/${auditId}`, params(kind));
      check(res, { "ok audit_detail": (r) => r.status === 200 && r.json("id") === auditId });
      break;
    }
    case "audit_lines": {
      const res = http.get(`${BASE}/audits/${auditId}/lines`, params(kind));
      check(res, { "ok audit_lines": (r) => r.status === 200 && Array.isArray(r.json("lines")) });
      break;
    }
    case "audit_create": {
      const key = `${exec.scenario.name}-${exec.vu.idInTest}-${exec.vu.iterationInScenario}`;
      const res = http.post(
        `${BASE}/audits`,
        JSON.stringify({ employmentId: user.employment, payslipId: user.payslip }),
        params(kind, { "Idempotency-Key": key }),
      );
      const ok = check(res, {
        "ok audit_create": (r) => r.status === 201 && typeof r.json("id") === "string",
      });
      if (ok) {
        latestAudit = res.json("id");
      }
      break;
    }
  }
}
