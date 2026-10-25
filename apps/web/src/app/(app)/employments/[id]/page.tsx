"use client";

import { CalendarClock, Pencil, ReceiptText } from "lucide-react";
import Link from "next/link";
import { use } from "react";

import { DescriptionList } from "@/components/description-list";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEmployment } from "@/lib/api/hooks";
import {
  EMPLOYMENT_TYPE_LABELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  classificationLabel,
  formatDuration,
  spanExceptionLabel,
  stateLabel,
} from "@/lib/employment-form";
import { formatDate } from "@wageguard/presentation";

const ANSWERS: Readonly<Record<string, string>> = {
  CONFIRMED: "Confirmed",
  UNSURE: "Not sure",
  NONE: "No",
  APPLIES: "Yes",
  ADULT_21_PLUS: "Yes",
  UNDER_21: "No",
  NO: "No",
  YES: "Yes",
};

const yesNo = (value: boolean) => (value ? "Yes" : "No");

export default function EmploymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const employment = useEmployment(id);

  if (employment.isPending) {
    return <LoadingState label="Loading employment" />;
  }
  if (employment.isError) {
    return <ErrorState error={employment.error} onRetry={() => void employment.refetch()} />;
  }
  const e = employment.data;
  const allowances = [
    e.allowances.laundersSpecialClothing ? "Laundry" : null,
    e.allowances.appointedFirstAider ? "First aid" : null,
    e.allowances.holdsLiquorLicence ? "Liquor licence" : null,
    e.allowances.brokenHill ? "Broken Hill" : null,
  ].filter((a): a is string => a !== null);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Employment", href: "/employments" }]}
        title={e.label}
        description={`${EMPLOYMENT_TYPE_LABELS[e.employmentType]} · ${classificationLabel(e.classificationCode)} · General Retail Industry Award 2020`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/employments/${e.id}/edit`}>
                <Pencil aria-hidden />
                Edit
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/shifts?employmentId=${e.id}`}>
                <CalendarClock aria-hidden />
                View shifts
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/payslips/new?employmentId=${e.id}`}>
                <ReceiptText aria-hidden />
                Enter a payslip
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>The job</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                ["Employment type", EMPLOYMENT_TYPE_LABELS[e.employmentType]],
                ["Classification", classificationLabel(e.classificationCode)],
                ["State or territory", stateLabel(e.state)],
                ["Time zone", e.timeZone],
                ["Workplace hours", spanExceptionLabel(e.conditions.spanException)],
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Your answers</h2>
            </CardTitle>
            <CardDescription>&ldquo;Not sure&rdquo; answers make audits ask for review.</CardDescription>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                ["Covered by the General Retail Industry Award", ANSWERS[e.declarations.awardCoverage]],
                ["Enterprise agreement applies", ANSWERS[e.declarations.enterpriseAgreement]],
                ["21 or older for the whole pay period", ANSWERS[e.declarations.ageBand]],
                ["Employed to do shiftwork", ANSWERS[e.declarations.shiftworker]],
                ["Date of birth", e.dateOfBirth === null ? "Not given" : formatDate(e.dateOfBirth)],
                [
                  "Started this job",
                  e.employmentStartDate === null ? "Not given" : formatDate(e.employmentStartDate),
                ],
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Working arrangements and allowances</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                ...(e.employmentType === "CASUAL"
                  ? ([["Full-time school student", yesNo(e.conditions.schoolStudent)]] as const)
                  : []),
                ["10-hour break between work days agreed", yesNo(e.conditions.reducedBreakAgreed)],
                ["Averaging roster", yesNo(e.conditions.averagingRoster)],
                ["Baking production", yesNo(e.conditions.bakingProduction)],
                ["Apprentice or trainee", yesNo(e.conditions.apprentice)],
                ["Job allowances", allowances.length === 0 ? "None" : allowances.join(", ")],
              ]}
            />
          </CardContent>
        </Card>
        {e.partTimeGuaranteedMinutes === null ? null : (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Guaranteed hours</h2>
              </CardTitle>
              <CardDescription>From the written part-time agreement (cl. 10.5).</CardDescription>
            </CardHeader>
            <CardContent>
              <DescriptionList
                items={WEEKDAYS.map(
                  (day) =>
                    [
                      WEEKDAY_LABELS[day],
                      <span key={day} className="tabular-nums">
                        {formatDuration(e.partTimeGuaranteedMinutes?.[day] ?? 0)}
                      </span>,
                    ] as const,
                )}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
