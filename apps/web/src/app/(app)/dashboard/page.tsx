"use client";

import type { DashboardResponse } from "@wageguard/api-contracts";
import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  FileSearch,
  Plus,
  TrendingDown,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { AuditHistoryChart } from "@/components/audit-history-chart";
import { AuditTable } from "@/components/audit-table";
import { VerificationNotice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard, useEmployments, usePayslips, useShifts } from "@/lib/api/hooks";
import { FINDING_STATUS, type FindingStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { formatAud } from "@wageguard/presentation";

const BAR_TONE = {
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-neutral",
} as const;
const ORDER: readonly FindingStatus[] = [
  "MATCHED",
  "POTENTIAL_UNDERPAYMENT",
  "POTENTIAL_OVERPAYMENT",
  "REVIEW_REQUIRED",
  "INCOMPLETE_DATA",
  "UNSUPPORTED_SCENARIO",
];

/** How the user's audits split across results: one bar, with the same numbers listed beneath. */
function ResultsBreakdown({
  counts,
  total,
}: {
  counts: DashboardResponse["totals"]["byFindingStatus"];
  total: number;
}) {
  const rows = ORDER.map((status) => ({ status, count: counts[status], ...FINDING_STATUS[status] })).filter(
    (r) => r.count > 0,
  );
  return (
    <div>
      <div className="bg-muted flex h-2.5 overflow-hidden rounded-full" aria-hidden>
        {rows.map((r) => (
          <span
            key={r.status}
            className={BAR_TONE[r.tone]}
            style={{ width: `${(r.count / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-5 grid gap-3">
        {rows.map((r) => (
          <li key={r.status} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", BAR_TONE[r.tone])} aria-hidden />
              {r.label}
            </span>
            <span className="text-muted-foreground tabular-nums">
              <span className="text-foreground font-medium">{r.count}</span> ·{" "}
              {Math.round((r.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** For a new account: the four steps to a first audit, ticked off from the user's own records. */
function GettingStarted() {
  const employments = useEmployments();
  const shifts = useShifts({});
  const payslips = usePayslips();
  const steps: { label: string; detail: string; href: Route; done: boolean }[] = [
    {
      label: "Describe your job",
      detail: "Award, classification, state and anything unusual about it.",
      href: "/employments/new",
      done: (employments.data?.items.length ?? 0) > 0,
    },
    {
      label: "Record your shifts",
      detail: "Type them in or import a CSV from your roster app.",
      href: "/shifts/new",
      done: (shifts.data?.pages[0]?.items.length ?? 0) > 0,
    },
    {
      label: "Enter a payslip",
      detail: "Gross pay, or each line if you want a closer comparison.",
      href: "/payslips/new",
      done: (payslips.data?.items.length ?? 0) > 0,
    },
    {
      label: "Run your first audit",
      detail: "See every dollar worked out.",
      href: "/audits/new",
      done: false,
    },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Get your first result</h2>
        </CardTitle>
        <CardDescription>Four steps, about five minutes.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2">
          {steps.map((step, i) => (
            <li key={step.label}>
              <Link
                href={step.href}
                className={cn(
                  "flex items-center gap-4 rounded-lg border p-3.5 transition-colors",
                  i === next ? "border-primary/40 bg-accent/60 hover:bg-accent" : "hover:bg-muted/60",
                )}
              >
                {step.done ? (
                  <CircleCheck className="text-info size-5 shrink-0" aria-hidden />
                ) : (
                  <CircleDashed
                    className={cn("size-5 shrink-0", i === next ? "text-primary" : "text-muted-foreground")}
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      step.done && "text-muted-foreground line-through",
                    )}
                  >
                    {step.label}
                    <span className="sr-only">{step.done ? " (done)" : ""}</span>
                  </span>
                  <span className="text-muted-foreground block text-xs">{step.detail}</span>
                </span>
                {i === next ? <ArrowRight className="text-primary size-4 shrink-0" aria-hidden /> : null}
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const dashboard = useDashboard();
  const actions = (
    <Button asChild>
      <Link href="/audits/new">
        <Plus aria-hidden />
        Run an audit
      </Link>
    </Button>
  );

  if (dashboard.isPending) {
    return (
      <>
        <PageHeader title="Dashboard" actions={actions} />
        <LoadingState label="Loading your dashboard" rows={4} />
      </>
    );
  }
  if (dashboard.isError) {
    return (
      <>
        <PageHeader title="Dashboard" actions={actions} />
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      </>
    );
  }

  const { totals, history, recentAudits, processing } = dashboard.data;
  const discrepancies =
    totals.byFindingStatus.POTENTIAL_UNDERPAYMENT + totals.byFindingStatus.POTENTIAL_OVERPAYMENT;
  const shortfall = totals.potentialUnderpaymentAmount.replace("-", "");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your audits at a glance. Every figure comes from an audit you've saved."
        actions={actions}
      />
      <div className="space-y-6">
        <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={FileSearch}
            label="Audits run"
            value={totals.audits}
            detail={`${processing.completed} completed`}
          />
          <StatCard
            icon={CalendarClock}
            label="Shifts analysed"
            value={totals.shiftsAnalysed}
            detail="Across all audits"
          />
          <StatCard
            icon={TrendingDown}
            tone={totals.byFindingStatus.POTENTIAL_UNDERPAYMENT > 0 ? "danger" : "neutral"}
            label="Potential underpayments"
            value={totals.byFindingStatus.POTENTIAL_UNDERPAYMENT}
            detail={`${formatAud(shortfall)} below calculated minimums · ${discrepancies} ${discrepancies === 1 ? "discrepancy" : "discrepancies"} in total`}
          />
          <StatCard
            icon={CircleAlert}
            tone={totals.needsAttention > 0 ? "warning" : "neutral"}
            label="Need attention"
            value={totals.needsAttention}
            detail="Needs review, more information or not supported"
          />
        </section>

        {totals.audits === 0 ? <GettingStarted /> : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Audit history</h2>
              </CardTitle>
              <CardDescription>Audits run per month, last 12 months.</CardDescription>
            </CardHeader>
            <CardContent>
              <AuditHistoryChart history={history} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Results</h2>
              </CardTitle>
              <CardDescription>How your audits came out.</CardDescription>
            </CardHeader>
            <CardContent>
              {totals.audits === 0 ? (
                <p className="text-muted-foreground text-sm">Results appear here after your first audit.</p>
              ) : (
                <ResultsBreakdown counts={totals.byFindingStatus} total={totals.audits} />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle>
              <h2>Recent audits</h2>
            </CardTitle>
            <CardDescription>
              Audits are processed immediately; all {processing.completed} have completed.
            </CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/audits">
                  View all
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          {recentAudits.length === 0 ? (
            <CardContent className="py-6">
              <EmptyState
                icon={FileSearch}
                title="No audits yet"
                description="Add an employment, record your shifts and enter a payslip, then run your first audit."
                action={
                  <Button asChild variant="outline">
                    <Link href="/employments">Set up your employment</Link>
                  </Button>
                }
              />
            </CardContent>
          ) : (
            <AuditTable audits={recentAudits} caption="Most recent audits" />
          )}
        </Card>

        <VerificationNotice />
      </div>
    </>
  );
}
