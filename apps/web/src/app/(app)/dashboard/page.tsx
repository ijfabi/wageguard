"use client";

import Link from "next/link";

import { AuditHistoryChart } from "@/components/audit-history-chart";
import { AuditTable } from "@/components/audit-table";
import { VerificationNotice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/lib/api/hooks";
import { formatAud } from "@/lib/money";

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">{detail}</CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const dashboard = useDashboard();
  const actions = (
    <Button asChild>
      <Link href="/audits/new">Run an audit</Link>
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

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your audits at a glance. Figures come from your saved audits."
        actions={actions}
      />
      <div className="space-y-6">
        <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Audits run"
            value={String(totals.audits)}
            detail={`${processing.completed} completed`}
          />
          <Stat label="Shifts analysed" value={String(totals.shiftsAnalysed)} detail="Across all audits" />
          <Stat
            label="Potential underpayments"
            value={String(totals.byFindingStatus.POTENTIAL_UNDERPAYMENT)}
            detail={`${formatAud(totals.potentialUnderpaymentAmount.replace("-", ""))} below calculated minimums · ${discrepancies} ${discrepancies === 1 ? "discrepancy" : "discrepancies"} in total`}
          />
          <Stat
            label="Need attention"
            value={String(totals.needsAttention)}
            detail="Needs review, more information or not supported"
          />
        </section>

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
              <h2>Recent audits</h2>
            </CardTitle>
            <CardDescription>
              Audits are processed immediately; all {processing.completed} have completed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentAudits.length === 0 ? (
              <EmptyState
                title="No audits yet"
                description="Add an employment, record your shifts and enter a payslip, then run your first audit."
                action={
                  <Button asChild variant="outline">
                    <Link href="/employments">Set up your employment</Link>
                  </Button>
                }
              />
            ) : (
              <AuditTable audits={recentAudits} caption="Most recent audits" />
            )}
          </CardContent>
        </Card>

        <VerificationNotice />
      </div>
    </>
  );
}
