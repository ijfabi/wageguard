"use client";

import Link from "next/link";
import { use } from "react";

import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEmployment } from "@/lib/api/hooks";
import {
  EMPLOYMENT_TYPE_LABELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  classificationLabel,
  formatDuration,
} from "@/lib/employment-form";

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
  const declarations: [string, string][] = [
    ["Covered by the General Retail Industry Award", e.declarations.awardCoverage],
    ["Enterprise agreement applies", e.declarations.enterpriseAgreement],
    ["21 or older for the whole pay period", e.declarations.ageBand],
    ["Employed to do shiftwork", e.declarations.shiftworker],
  ];

  return (
    <>
      <PageHeader
        title={e.label}
        description={`${EMPLOYMENT_TYPE_LABELS[e.employmentType]} · ${classificationLabel(e.classificationCode)} · ${e.awardCode} · ${e.timeZone}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/shifts?employmentId=${e.id}`}>View shifts</Link>
            </Button>
            <Button asChild>
              <Link href={`/payslips/new?employmentId=${e.id}`}>Enter a payslip</Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Your answers</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              {declarations.map(([question, answer]) => (
                <div key={question} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{question}</dt>
                  <dd className="font-medium">{ANSWERS[answer] ?? answer}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        {e.partTimeGuaranteedMinutes === null ? null : (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Guaranteed hours</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="flex justify-between">
                    <dt className="text-muted-foreground">{WEEKDAY_LABELS[day]}</dt>
                    <dd className="tabular-nums">
                      {formatDuration(e.partTimeGuaranteedMinutes?.[day] ?? 0)}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
