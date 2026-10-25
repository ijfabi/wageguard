import {
  DEFAULT_ALLOWANCES,
  DEFAULT_WORK_CONDITIONS,
  type AustralianState,
  type CreateEmploymentRequest,
  type EmploymentResponse,
} from "@wageguard/api-contracts";
import { z } from "zod";

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

/**
 * MA000004 Schedule A, with indicative job titles quoted from the award (cl. A.1.3 to A.8.3).
 * Every level is priced by the rule set in force from 1 July 2026.
 */
export const CLASSIFICATIONS = [
  {
    code: "RETAIL_EMPLOYEE_LEVEL_1",
    label: "Retail Employee Level 1",
    example: "Shop assistant, check-out operator, store worker (A.1.3)",
  },
  {
    code: "RETAIL_EMPLOYEE_LEVEL_2",
    label: "Retail Employee Level 2",
    example: "Forklift operator, ride-on equipment operator (A.2.2)",
  },
  {
    code: "RETAIL_EMPLOYEE_LEVEL_3",
    label: "Retail Employee Level 3",
    example: "Senior salesperson, second-in-charge to a department manager (A.3.3)",
  },
  {
    code: "RETAIL_EMPLOYEE_LEVEL_4",
    label: "Retail Employee Level 4",
    example: "Trade-qualified butcher, baker or florist; nightfill supervisor (A.4.3)",
  },
  {
    code: "RETAIL_EMPLOYEE_LEVEL_5",
    label: "Retail Employee Level 5",
    example: "Tradesperson in charge of other tradespersons; service supervisor of more than 15 (A.5.2)",
  },
  {
    code: "RETAIL_EMPLOYEE_LEVEL_6",
    label: "Retail Employee Level 6",
    example: "Department manager with 5 or more employees; manager of a shop without departments (A.6.2)",
  },
  {
    code: "RETAIL_EMPLOYEE_LEVEL_7",
    label: "Retail Employee Level 7",
    example: "Visual merchandiser with a Diploma; Clerical Officer Level 4 (A.7.2)",
  },
  {
    code: "RETAIL_EMPLOYEE_LEVEL_8",
    label: "Retail Employee Level 8",
    example: "Shop manager of a shop with departments or sections (A.8.3)",
  },
] as const;

export const STATES: readonly {
  readonly id: AustralianState;
  readonly label: string;
  readonly timeZone: string;
}[] = [
  { id: "NSW", label: "New South Wales", timeZone: "Australia/Sydney" },
  { id: "VIC", label: "Victoria", timeZone: "Australia/Melbourne" },
  { id: "QLD", label: "Queensland", timeZone: "Australia/Brisbane" },
  { id: "SA", label: "South Australia", timeZone: "Australia/Adelaide" },
  { id: "WA", label: "Western Australia", timeZone: "Australia/Perth" },
  { id: "TAS", label: "Tasmania", timeZone: "Australia/Hobart" },
  { id: "NT", label: "Northern Territory", timeZone: "Australia/Darwin" },
  { id: "ACT", label: "Australian Capital Territory", timeZone: "Australia/Sydney" },
];

export const stateLabel = (id: string | null) => STATES.find((s) => s.id === id)?.label ?? "Not recorded";

export const AUSTRALIAN_TIME_ZONES = [
  { id: "Australia/Sydney", label: "Sydney, Canberra (AEST/AEDT)" },
  { id: "Australia/Melbourne", label: "Melbourne (AEST/AEDT)" },
  { id: "Australia/Brisbane", label: "Brisbane (AEST, no daylight saving)" },
  { id: "Australia/Adelaide", label: "Adelaide (ACST/ACDT)" },
  { id: "Australia/Broken_Hill", label: "Broken Hill, NSW (ACST/ACDT)" },
  { id: "Australia/Perth", label: "Perth (AWST)" },
  { id: "Australia/Hobart", label: "Hobart (AEST/AEDT)" },
  { id: "Australia/Darwin", label: "Darwin (ACST)" },
] as const;

export const SPAN_EXCEPTIONS = [
  { id: "NONE", label: "None of these" },
  { id: "NEWSAGENCY", label: "Newsagency (ordinary hours from 5 am)" },
  { id: "VIDEO_SHOP", label: "Video hire shop (ordinary hours to midnight)" },
  { id: "EXTENDED_TRADING", label: "Trades past 9 pm weekdays or 6 pm weekends (ordinary hours to 11 pm)" },
] as const;

/** "7:36" -> 456 minutes; "" -> null. Hours 0-24, minutes 00-59; at most 24:00. */
export function parseDuration(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(trimmed);
  if (match === null) {
    throw new Error("Use hours:minutes, for example 7:30");
  }
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes > 24 * 60) {
    throw new Error("At most 24:00 in a day");
  }
  return minutes;
}

export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

const durationField = z.string().refine((v) => {
  try {
    parseDuration(v);
    return true;
  } catch {
    return false;
  }
}, "Use hours:minutes, for example 7:30");

const optionalDate = z.union([z.literal(""), z.iso.date("Use a full date")]);

export const EmploymentFormSchema = z
  .object({
    label: z.string().trim().min(1, "Give this job a name").max(100),
    classificationCode: z.string().min(1),
    employmentType: z.enum(["CASUAL", "PART_TIME", "FULL_TIME"]),
    state: z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]),
    timeZone: z.string().min(1),
    awardCoverage: z.enum(["CONFIRMED", "UNSURE"]),
    enterpriseAgreement: z.enum(["NONE", "APPLIES", "UNSURE"]),
    ageBand: z.enum(["ADULT_21_PLUS", "UNDER_21", "UNSURE"]),
    shiftworker: z.enum(["NO", "YES", "UNSURE"]),
    dateOfBirth: optionalDate,
    employmentStartDate: optionalDate,
    spanException: z.enum(["NONE", "NEWSAGENCY", "VIDEO_SHOP", "EXTENDED_TRADING"]),
    schoolStudent: z.boolean(),
    reducedBreakAgreed: z.boolean(),
    averagingRoster: z.boolean(),
    bakingProduction: z.boolean(),
    apprentice: z.boolean(),
    laundersSpecialClothing: z.boolean(),
    appointedFirstAider: z.boolean(),
    holdsLiquorLicence: z.boolean(),
    brokenHill: z.boolean(),
    guaranteed: z.object(
      Object.fromEntries(WEEKDAYS.map((d) => [d, durationField])) as Record<Weekday, typeof durationField>,
    ),
  })
  .superRefine((v, ctx) => {
    if (v.ageBand === "UNDER_21" && v.dateOfBirth === "") {
      ctx.addIssue({
        code: "custom",
        path: ["dateOfBirth"],
        message: "Junior rates depend on your age on each day worked, so add your date of birth",
      });
    }
    if (v.dateOfBirth !== "" && v.employmentStartDate !== "" && v.dateOfBirth >= v.employmentStartDate) {
      ctx.addIssue({
        code: "custom",
        path: ["employmentStartDate"],
        message: "Must be after your date of birth",
      });
    }
    if (v.schoolStudent && v.employmentType !== "CASUAL") {
      ctx.addIssue({
        code: "custom",
        path: ["schoolStudent"],
        message: "This only applies to casual employees",
      });
    }
  });

export type EmploymentFormValues = z.infer<typeof EmploymentFormSchema>;

export const EMPTY_EMPLOYMENT_FORM: EmploymentFormValues = {
  label: "",
  classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
  employmentType: "CASUAL",
  state: "NSW",
  timeZone: "Australia/Sydney",
  awardCoverage: "CONFIRMED",
  enterpriseAgreement: "NONE",
  ageBand: "ADULT_21_PLUS",
  shiftworker: "NO",
  dateOfBirth: "",
  employmentStartDate: "",
  ...DEFAULT_WORK_CONDITIONS,
  ...DEFAULT_ALLOWANCES,
  guaranteed: { MON: "", TUE: "", WED: "", THU: "", FRI: "", SAT: "", SUN: "" },
};

/** Form values -> API request. Guaranteed hours are only sent for part-time employment. */
export function toCreateEmploymentRequest(values: EmploymentFormValues): CreateEmploymentRequest {
  const guaranteed: Partial<Record<Weekday, number>> = {};
  for (const day of WEEKDAYS) {
    const minutes = parseDuration(values.guaranteed[day]);
    if (minutes !== null) {
      guaranteed[day] = minutes;
    }
  }
  return {
    label: values.label.trim(),
    awardCode: "MA000004",
    classificationCode: values.classificationCode,
    employmentType: values.employmentType,
    state: values.state,
    timeZone: values.timeZone,
    declarations: {
      awardCoverage: values.awardCoverage,
      enterpriseAgreement: values.enterpriseAgreement,
      ageBand: values.ageBand,
      shiftworker: values.shiftworker,
    },
    ...(values.employmentType === "PART_TIME" ? { partTimeGuaranteedMinutes: guaranteed } : {}),
    ...(values.dateOfBirth === "" ? {} : { dateOfBirth: values.dateOfBirth }),
    ...(values.employmentStartDate === "" ? {} : { employmentStartDate: values.employmentStartDate }),
    conditions: {
      spanException: values.spanException,
      schoolStudent: values.employmentType === "CASUAL" && values.schoolStudent,
      reducedBreakAgreed: values.reducedBreakAgreed,
      averagingRoster: values.averagingRoster,
      bakingProduction: values.bakingProduction,
      apprentice: values.apprentice,
    },
    allowances: {
      laundersSpecialClothing: values.laundersSpecialClothing,
      appointedFirstAider: values.appointedFirstAider,
      holdsLiquorLicence: values.holdsLiquorLicence,
      brokenHill: values.brokenHill,
    },
  };
}

/** A saved employment -> form values, for editing. */
export function toEmploymentFormValues(e: EmploymentResponse): EmploymentFormValues {
  const guaranteed = { ...EMPTY_EMPLOYMENT_FORM.guaranteed };
  for (const day of WEEKDAYS) {
    const minutes = e.partTimeGuaranteedMinutes?.[day];
    guaranteed[day] = minutes === undefined ? "" : formatDuration(minutes);
  }
  return {
    label: e.label,
    classificationCode: e.classificationCode,
    employmentType: e.employmentType,
    state: e.state ?? STATES.find((s) => s.timeZone === e.timeZone)?.id ?? "NSW",
    timeZone: e.timeZone,
    ...e.declarations,
    dateOfBirth: e.dateOfBirth ?? "",
    employmentStartDate: e.employmentStartDate ?? "",
    ...e.conditions,
    ...e.allowances,
    guaranteed,
  };
}

export const EMPLOYMENT_TYPE_LABELS: Readonly<Record<EmploymentResponse["employmentType"], string>> = {
  CASUAL: "Casual",
  PART_TIME: "Part-time",
  FULL_TIME: "Full-time",
};

export function classificationLabel(code: string): string {
  return CLASSIFICATIONS.find((c) => c.code === code)?.label ?? code;
}

export function spanExceptionLabel(id: string): string {
  return SPAN_EXCEPTIONS.find((s) => s.id === id)?.label ?? id;
}
