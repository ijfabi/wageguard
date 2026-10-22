import { LIMITS } from "@wageguard/api-contracts";
import { parse } from "csv-parse/sync";

import type { ApiIssue } from "../../common/api-error.js";
import type { ShiftTimes } from "./shift-times.js";

/** Required header, in order. Meal break columns may be left empty. */
export const CSV_COLUMNS = ["start", "end", "meal_start", "meal_end"] as const;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type CsvParseResult = { ok: true; rows: ShiftTimes[] } | { ok: false; issues: ApiIssue[] };

/**
 * Parses a timesheet CSV strictly: exact header, at most LIMITS.maxCsvRows data rows, every cell
 * must be a wall-clock "YYYY-MM-DDTHH:MM" value (or empty for the optional meal columns). Because
 * cells are validated against that pattern, spreadsheet formulas or scripts can never pass through.
 * Errors name the 1-based CSV line so users can fix their file.
 */
export function parseShiftCsv(text: string): CsvParseResult {
  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: false,
      max_record_size: 1024,
      to: LIMITS.maxCsvRows + 2,
    });
  } catch (error: unknown) {
    return {
      ok: false,
      issues: [{ code: "MALFORMED_CSV", message: error instanceof Error ? error.message : "Malformed CSV" }],
    };
  }

  const [header, ...rows] = records;
  if (header === undefined || header.map((h) => h.toLowerCase()).join(",") !== CSV_COLUMNS.join(",")) {
    return {
      ok: false,
      issues: [
        {
          code: "INVALID_CSV_HEADER",
          message: `The first line must be exactly: ${CSV_COLUMNS.join(",")}`,
          path: "line 1",
        },
      ],
    };
  }
  if (rows.length === 0) {
    return { ok: false, issues: [{ code: "EMPTY_CSV", message: "The CSV has no shift rows" }] };
  }
  if (rows.length > LIMITS.maxCsvRows) {
    return {
      ok: false,
      issues: [{ code: "TOO_MANY_ROWS", message: `At most ${LIMITS.maxCsvRows} shift rows are accepted` }],
    };
  }

  const issues: ApiIssue[] = [];
  const parsed: ShiftTimes[] = [];
  rows.forEach((row, index) => {
    const line = `line ${index + 2}`;
    const [start = "", end = "", mealStart = "", mealEnd = ""] = row;
    const bad = [
      ["start", start],
      ["end", end],
    ].filter(([, v]) => !LOCAL_DATE_TIME.test(v ?? ""));
    const mealGiven = mealStart !== "" || mealEnd !== "";
    if (mealGiven && (!LOCAL_DATE_TIME.test(mealStart) || !LOCAL_DATE_TIME.test(mealEnd))) {
      bad.push(["meal_start/meal_end", `${mealStart}/${mealEnd}`]);
    }
    for (const [column] of bad) {
      issues.push({
        code: "INVALID_CSV_VALUE",
        message: `${column} must be YYYY-MM-DDTHH:MM`,
        path: `${line}.${column ?? ""}`,
      });
    }
    if (bad.length === 0) {
      parsed.push({
        start,
        end,
        breaks: mealGiven ? [{ kind: "UNPAID_MEAL", start: mealStart, end: mealEnd }] : [],
      });
    }
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, rows: parsed };
}
