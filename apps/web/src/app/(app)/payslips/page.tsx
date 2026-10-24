"use client";

import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEmployments, usePayslips } from "@/lib/api/hooks";
import { formatAud, formatDate } from "@wageguard/presentation";

export default function PayslipsPage() {
  const payslips = usePayslips();
  const employments = useEmployments();
  const labels = new Map((employments.data?.items ?? []).map((e) => [e.id, e.label]));

  return (
    <>
      <PageHeader
        title="Payslips"
        description="Payslips you have entered, newest first."
        actions={
          <Button asChild>
            <Link href="/payslips/new">Enter a payslip</Link>
          </Button>
        }
      />
      {payslips.isPending ? (
        <LoadingState label="Loading payslips" />
      ) : payslips.isError ? (
        <ErrorState error={payslips.error} onRetry={() => void payslips.refetch()} />
      ) : payslips.data.items.length === 0 ? (
        <EmptyState
          title="No payslips yet"
          description="Enter the gross pay from a payslip to compare it with your recorded shifts."
          action={
            <Button asChild>
              <Link href="/payslips/new">Enter a payslip</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <caption className="sr-only">Entered payslips</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Pay period</TableHead>
              <TableHead className="hidden sm:table-cell">Employment</TableHead>
              <TableHead className="text-right">Gross pay</TableHead>
              <TableHead className="hidden text-right md:table-cell">Lines</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payslips.data.items.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="whitespace-normal sm:whitespace-nowrap">
                  <span className="font-medium">
                    {formatDate(p.payPeriod.startDate)} – {formatDate(p.payPeriod.endDate)}
                  </span>
                  {/* On narrow screens the employment folds in under the pay period. */}
                  <span className="text-muted-foreground block text-xs sm:hidden">
                    {labels.get(p.employmentId) ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{labels.get(p.employmentId) ?? "—"}</TableCell>
                <TableCell className="text-right align-top tabular-nums sm:align-middle">
                  {formatAud(p.grossPay)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {p.lines.length}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/audits/new?employmentId=${p.employmentId}&payslipId=${p.id}`}>
                      Run audit
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
