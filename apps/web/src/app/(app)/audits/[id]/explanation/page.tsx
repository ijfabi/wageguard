"use client";

import Link from "next/link";
import { use } from "react";

import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuditReport } from "@/lib/api/hooks";
import { formatDate, formatMinutes, formatShiftSpan, formatTime } from "@/lib/format";
import { formatAud } from "@/lib/money";
import { issueTitle } from "@/lib/status";

const SEVERITY: Readonly<Record<string, string>> = {
  UNSUPPORTED: "Not supported",
  INCOMPLETE_DATA: "Missing information",
  REVIEW_REQUIRED: "Needs review",
  WARNING: "Information",
};

export default function ExplanationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const report = useAuditReport(id);

  if (report.isPending) {
    return <LoadingState label="Loading calculation" rows={6} />;
  }
  if (report.isError) {
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  }
  const { calculation } = report.data;
  const { metadata } = calculation;

  return (
    <>
      <PageHeader
        title="How this was calculated"
        description={`Pay period ${formatDate(calculation.payPeriod.startDate)} – ${formatDate(calculation.payPeriod.endDate)}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/audits/${id}`}>Back to audit</Link>
          </Button>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Source</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              Rule set <span className="font-mono">{metadata.ruleSetVersion ?? "none"}</span>
              {metadata.ruleSetEffectiveFrom === null ? null : (
                <>
                  , effective from the first full pay period starting on or after{" "}
                  {formatDate(metadata.ruleSetEffectiveFrom)}
                </>
              )}
              .
            </p>
            {metadata.sourceUrl === null ? null : (
              <p>
                Rates transcribed from{" "}
                <a className="text-primary underline" href={metadata.sourceUrl} rel="noopener noreferrer">
                  the consolidated award
                </a>{" "}
                (amendments to{" "}
                {metadata.sourceConsolidatedAsAt === null ? "—" : formatDate(metadata.sourceConsolidatedAsAt)}
                ).
              </p>
            )}
            {metadata.roundingPolicy === null ? null : (
              <p className="text-muted-foreground">{metadata.roundingPolicy.rationale}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Calculation steps</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid list-decimal gap-2 pl-5 text-sm">
              {calculation.trace.map((step) => (
                <li key={step.step}>{step.detail}</li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {calculation.shifts.map((shift) => (
          <Card key={shift.shiftId}>
            <CardHeader>
              <CardTitle>
                <h2>{formatShiftSpan(shift.localStart, shift.localEnd)}</h2>
              </CardTitle>
              <CardDescription>
                {formatMinutes(shift.elapsedMinutes)} on site, {formatMinutes(shift.unpaidBreakMinutes)}{" "}
                unpaid break, {formatMinutes(shift.paidMinutes)} paid ·{" "}
                {shift.priced
                  ? `indicative ${formatAud(shift.indicativeAmount ?? "0")}`
                  : "not priced (see issues)"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {shift.segments.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  This shift could not be classified for this employment.
                </p>
              ) : (
                <Table>
                  <caption className="sr-only">Time segments for this shift</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-right">Minutes</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="hidden md:table-cell">Award clauses</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shift.segments.map((segment) => (
                      <TableRow key={segment.start}>
                        <TableCell>
                          {segment.weekday} {formatTime(segment.localStart.slice(11))} –{" "}
                          {formatTime(segment.localEnd.slice(11))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{segment.minutes}</TableCell>
                        <TableCell>
                          {segment.classification.kind === "RULE" ? (
                            <>
                              {segment.classification.description}{" "}
                              <span className="text-muted-foreground">
                                ({segment.classification.percentOfMinimumHourlyRate}%)
                              </span>
                            </>
                          ) : segment.classification.kind === "OUTSIDE_SPAN" ? (
                            "Outside ordinary hours: not calculated"
                          ) : (
                            "Declared public holiday: not calculated"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {segment.hourlyRate === null ? "—" : formatAud(segment.hourlyRate)}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                          {segment.classification.kind === "RULE"
                            ? segment.classification.clauseRefs.join(", ")
                            : "15.1, 21.2"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))}

        {calculation.issues.length === 0 ? null : (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Issues and warnings</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 text-sm">
                {calculation.issues.map((i, index) => (
                  <li key={`${i.code}-${index}`} className="rounded-md border p-3">
                    <p className="font-medium">
                      {issueTitle(i.code)}{" "}
                      <span className="text-muted-foreground font-normal">
                        · {SEVERITY[i.severity] ?? i.severity}
                      </span>
                    </p>
                    <p className="mt-1">{i.message}</p>
                    {i.clauseRefs.length === 0 ? null : (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Award clauses: {i.clauseRefs.join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
