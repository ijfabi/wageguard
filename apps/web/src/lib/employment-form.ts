import type { CreateEmploymentRequest, EmploymentResponse } from "@wageguard/api-contracts";
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

export const CLASSIFICATIONS = [
  { code: "RETAIL_EMPLOYEE_LEVEL_1", label: "Retail Employee Level 1 (supported)" },
  { code: "RETAIL_EMPLOYEE_LEVEL_2", label: "Retail Employee Level 2 (not yet supported)" },
  { code: "RETAIL_EMPLOYEE_LEVEL_3", label: "Retail Employee Level 3 (not yet supported)" },
  { code: "RETAIL_EMPLOYEE_LEVEL_4", label: "Retail Employee Level 4 (not yet supported)" },
] as const;

export const AUSTRALIAN_TIME_ZONES = [
  { id: "Australia/Sydney", label: "New South Wales (Sydney)" },
  { id: "Australia/Melbourne", label: "Victoria (Melbourne)" },
  { id: "Australia/Brisbane", label: "Queensland (Brisbane)" },
  { id: "Australia/Adelaide", label: "South Australia (Adelaide)" },
  { id: "Australia/Perth", label: "Western Australia (Perth)" },
  { id: "Australia/Hobart", label: "Tasmania (Hobart)" },
  { id: "Australia/Darwin", label: "Northern Territory (Darwin)" },
  { id: "Australia/Canberra", label: "Australian Capital Territory (Canberra)" },
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

export const EmploymentFormSchema = z.object({
  label: z.string().trim().min(1, "Give this job a name").max(100),
  classificationCode: z.string().min(1),
  employmentType: z.enum(["CASUAL", "PART_TIME", "FULL_TIME"]),
  timeZone: z.string().min(1),
  awardCoverage: z.enum(["CONFIRMED", "UNSURE"]),
  enterpriseAgreement: z.enum(["NONE", "APPLIES", "UNSURE"]),
  ageBand: z.enum(["ADULT_21_PLUS", "UNDER_21", "UNSURE"]),
  shiftworker: z.enum(["NO", "YES", "UNSURE"]),
  guaranteed: z.object(
    Object.fromEntries(WEEKDAYS.map((d) => [d, durationField])) as Record<Weekday, typeof durationField>,
  ),
});

export type EmploymentFormValues = z.infer<typeof EmploymentFormSchema>;

export const EMPTY_EMPLOYMENT_FORM: EmploymentFormValues = {
  label: "",
  classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
  employmentType: "CASUAL",
  timeZone: "Australia/Sydney",
  awardCoverage: "CONFIRMED",
  enterpriseAgreement: "NONE",
  ageBand: "ADULT_21_PLUS",
  shiftworker: "NO",
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
    timeZone: values.timeZone,
    declarations: {
      awardCoverage: values.awardCoverage,
      enterpriseAgreement: values.enterpriseAgreement,
      ageBand: values.ageBand,
      shiftworker: values.shiftworker,
    },
    ...(values.employmentType === "PART_TIME" ? { partTimeGuaranteedMinutes: guaranteed } : {}),
  };
}

export const EMPLOYMENT_TYPE_LABELS: Readonly<Record<EmploymentResponse["employmentType"], string>> = {
  CASUAL: "Casual",
  PART_TIME: "Part-time",
  FULL_TIME: "Full-time",
};

export function classificationLabel(code: string): string {
  return CLASSIFICATIONS.find((c) => c.code === code)?.label.replace(/ \(.*\)$/, "") ?? code;
}
