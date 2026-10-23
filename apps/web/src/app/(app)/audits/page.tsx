"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AuditTable } from "@/components/audit-table";
import { NativeSelect } from "@/components/native-select";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAudits } from "@/lib/api/hooks";
import { FINDING_STATUS, type FindingStatus } from "@/lib/status";

const STATUSES = Object.keys(FINDING_STATUS) as FindingStatus[];
const isStatus = (value: string | null): value is FindingStatus =>
  value !== null && (STATUSES as string[]).includes(value);

export default function AuditsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const statusParam = params.get("status");
  const status = isStatus(statusParam) ? statusParam : undefined;
  const audits = useAudits(status === undefined ? {} : { findingStatus: status });
  const rows = audits.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Audit history"
        description="Every audit is a saved snapshot: later edits to shifts or payslips never change it."
        actions={
          <Button asChild>
            <Link href="/audits/new">Run an audit</Link>
          </Button>
        }
      />
      <div className="mb-4 grid max-w-xs gap-1.5">
        <Label htmlFor="status-filter">Result</Label>
        <NativeSelect
          id="status-filter"
          value={status ?? ""}
          onChange={(e) => {
            router.replace(e.target.value === "" ? "/audits" : `/audits?status=${e.target.value}`);
          }}
        >
          <option value="">All results</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {FINDING_STATUS[s].label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {audits.isPending ? (
        <LoadingState label="Loading audits" />
      ) : audits.isError ? (
        <ErrorState error={audits.error} onRetry={() => void audits.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={status === undefined ? "No audits yet" : "No audits with this result"}
          description="Run an audit to compare a payslip with the shifts you recorded for its pay period."
          action={
            <Button asChild>
              <Link href="/audits/new">Run an audit</Link>
            </Button>
          }
        />
      ) : (
        <>
          <AuditTable audits={rows} caption="Audit history" />
          {audits.hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => void audits.fetchNextPage()}
                disabled={audits.isFetchingNextPage}
              >
                {audits.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
