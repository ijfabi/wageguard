/**
 * Seeds a synthetic demonstration account through the public API (so every validation rule
 * applies). Never use real personal or employer data.
 *
 *   DEMO_PASSWORD='<at least 12 characters>' pnpm --filter @wageguard/api seed:demo
 *
 * Optional: DEMO_EMAIL (default demo@wageguard.example), API_URL (default http://127.0.0.1:3001/api/v1).
 * The password is never stored in the repository; choose your own.
 */
import { randomUUID } from "node:crypto";

const API_URL = process.env["API_URL"] ?? "http://127.0.0.1:3001/api/v1";
const EMAIL = process.env["DEMO_EMAIL"] ?? "demo@wageguard.example";
const PASSWORD = process.env["DEMO_PASSWORD"];

if (PASSWORD === undefined || PASSWORD.length < 12) {
  console.error("Set DEMO_PASSWORD (at least 12 characters). It is not stored anywhere in the repository.");
  process.exit(1);
}

let cookie = "";

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const isCsv = typeof body === "string";
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": isCsv ? "text/csv" : "application/json" }),
      ...(cookie === "" ? {} : { cookie }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: isCsv ? body : JSON.stringify(body) }),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie !== null) {
    cookie = setCookie.split(";")[0] ?? "";
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${text}`);
  }
  return (text === "" ? undefined : JSON.parse(text)) as T;
}

const declarations = {
  awardCoverage: "CONFIRMED",
  enterpriseAgreement: "NONE",
  ageBand: "ADULT_21_PLUS",
  shiftworker: "NO",
};

async function audit(employmentId: string, payslipId: string): Promise<string> {
  const result = await call<{ id: string; findingStatus: string }>(
    "POST",
    "/audits",
    { employmentId, payslipId },
    { "idempotency-key": randomUUID() },
  );
  return `${result.findingStatus} (${result.id})`;
}

async function main(): Promise<void> {
  try {
    await call("POST", "/auth/register", { email: EMAIL, password: PASSWORD });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("EMAIL_TAKEN")) {
      console.error(`${EMAIL} already exists. Delete it in Settings (or use another DEMO_EMAIL) to reseed.`);
      process.exit(1);
    }
    throw error;
  }

  const casual = await call<{ id: string }>("POST", "/employments", {
    label: "Demo · Corner Store (synthetic, casual)",
    awardCode: "MA000004",
    classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
    employmentType: "CASUAL",
    timeZone: "Australia/Sydney",
    declarations,
  });

  // Fortnight 1 (6-19 July 2026): golden scenario G009, worth $862.15 at the award minimum.
  await call(
    "POST",
    `/shifts/import?employmentId=${casual.id}`,
    [
      "start,end,meal_start,meal_end",
      "2026-07-06T09:00,2026-07-06T17:00,2026-07-06T12:00,2026-07-06T12:30",
      "2026-07-11T08:00,2026-07-11T16:30,2026-07-11T12:00,2026-07-11T12:30",
      "2026-07-12T10:00,2026-07-12T16:00,2026-07-12T13:00,2026-07-12T13:30",
      // Fortnight 2 (20 July - 2 August): includes a late shift past 9 pm, which needs review.
      "2026-07-20T09:00,2026-07-20T17:00,2026-07-20T12:00,2026-07-20T12:30",
      "2026-07-24T17:00,2026-07-24T22:00,,",
      "",
    ].join("\n"),
  );

  const matched = await call<{ id: string }>("POST", "/payslips", {
    employmentId: casual.id,
    payPeriod: { startDate: "2026-07-06", endDate: "2026-07-19" },
    grossPay: "862.15",
    lines: [],
  });
  const underpaid = await call<{ id: string }>("POST", "/payslips", {
    employmentId: casual.id,
    payPeriod: { startDate: "2026-07-06", endDate: "2026-07-19" },
    grossPay: "840.00",
    lines: [
      { category: "HOURS_WORKED", description: "Ordinary and weekend hours", amount: "800.00" },
      { category: "ALLOWANCE", description: "Laundry allowance", amount: "40.00" },
    ],
  });
  const review = await call<{ id: string }>("POST", "/payslips", {
    employmentId: casual.id,
    payPeriod: { startDate: "2026-07-20", endDate: "2026-08-02" },
    grossPay: "450.00",
    lines: [],
  });

  const partTime = await call<{ id: string }>("POST", "/employments", {
    label: "Demo · Book Nook (synthetic, part-time)",
    awardCode: "MA000004",
    classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
    employmentType: "PART_TIME",
    timeZone: "Australia/Sydney",
    declarations,
    partTimeGuaranteedMinutes: { MON: 330, SAT: 330 },
  });
  await call("POST", "/shifts", {
    employmentId: partTime.id,
    start: "2026-07-06T14:00",
    end: "2026-07-06T20:00",
    breaks: [{ kind: "UNPAID_MEAL", start: "2026-07-06T16:00", end: "2026-07-06T16:30" }],
  });
  await call("POST", "/shifts", {
    employmentId: partTime.id,
    start: "2026-07-11T09:00",
    end: "2026-07-11T15:00",
    breaks: [{ kind: "UNPAID_MEAL", start: "2026-07-11T12:00", end: "2026-07-11T12:30" }],
  });
  const partTimeSlip = await call<{ id: string }>("POST", "/payslips", {
    employmentId: partTime.id,
    payPeriod: { startDate: "2026-07-06", endDate: "2026-07-19" },
    grossPay: "358.04",
    lines: [],
  });

  console.log(`Demo account ready: ${EMAIL}`);
  console.log(`  Casual, matched:      ${await audit(casual.id, matched.id)}`);
  console.log(`  Casual, underpaid:    ${await audit(casual.id, underpaid.id)}`);
  console.log(`  Casual, needs review: ${await audit(casual.id, review.id)}`);
  console.log(`  Part-time, matched:   ${await audit(partTime.id, partTimeSlip.id)}`);
}

await main();
