"use client";

import type { AuditDetail } from "@wageguard/api-contracts";
import { Download, FileSearch } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";

import { VerificationNotice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { CalculationStatusBadge } from "@/components/status-badge";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { useAudit, useAuditLines } from "@/lib/api/hooks";
import { downloadJson } from "@/lib/download";
import { formatDate, formatInstant, formatMinutes, formatShiftSpan, shortHash } from "@/lib/format";
import { humaniseShiftIds } from "@/lib/humanise";
import { formatAud, formatDifference } from "@/lib/money";
import { FINDING_STATUS, TONE_CLASSES, issueTitle } from "@/lib/status";
import { cn } from "@/lib/utils";

export default function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const audit = useAudit(id);
  const lines = useAuditLines(id);
  const [downloading, setDownloading] = useState(false);

  async function downloadReport() {
    setDownloading(true);
    try {
      downloadJson(await api.auditReport(id), `wageguard-audit-${id}.json`);
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(false);
    }
  }

  if (audit.isPending) {
    return <LoadingState label="Loading audit" rows={5} />;
  }
  if (audit.isError) {
    return <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />;
  }
  const a = audit.data;
  const status = FINDING_STATUS[a.findingStatus];
  const [periodFinding, ...issueFindings] = a.findings;

  return (
    <>
      <PageHeader
        title={`Audit: ${formatDate(a.payPeriod.startDate)} – ${formatDate(a.payPeriod.endDate)}`}
        description={`Run ${formatInstant(a.createdAt)} · ${a.shiftCount} ${a.shiftCount === 1 ? "shift" : "shifts"}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/audits/${a.id}/explanation`}>
                <FileSearch className="size-4" aria-hidden />
                How this was calculated
              </Link>
            </Button>
            <Button onClick={() => void downloadReport()} disabled={downloading}>
              <Download className="size-4" aria-hidden />
              {downloading ? "Preparing…" : "Download report"}
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <section
          aria-labelledby="result-heading"
          className={cn("rounded-lg border p-5", TONE_CLASSES[status.tone])}
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="result-heading" className="text-lg font-semibold">
              {status.label}
            </h2>
            <CalculationStatusBadge status={a.calculationStatus} />
          </div>
          <p className="text-foreground mt-2 text-sm">{periodFinding?.explanation ?? status.description}</p>
          {periodFinding === undefined ? null : (
            <p className="text-foreground mt-2 text-sm font-medium">Next step: {periodFinding.nextStep}</p>
          )}
        </section>

        <section aria-label="Amounts" className="grid gap-4 sm:grid-cols-3">
          <Amount
            label="Reported pay"
            value={formatAud(a.reportedAmount)}
            detail={
              a.comparisonBasis === "GROSS_PAY"
                ? "Gross pay from your payslip"
                : "Payslip lines for time worked"
            }
          />
          <Amount
            label="Calculated award minimum"
            value={a.expectedAmount === null ? "Not calculated" : formatAud(a.expectedAmount)}
            detail={
              a.calculationStatus === "CALCULATED"
                ? "All paid time priced"
                : "Only the shifts WageGuard could check"
            }
          />
          <Amount
            label={a.calculationStatus === "CALCULATED" ? "Difference" : "Difference vs checked shifts"}
            value={a.difference === null ? "—" : formatDifference(a.difference)}
            detail={
              a.calculationStatus === "CALCULATED"
                ? `Rounding tolerance ${formatAud(a.roundingTolerance)}`
                : "Not a verified overpayment: some hours were not priced"
            }
          />
        </section>

        {a.notes.length === 0 ? null : (
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            {a.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}

        {issueFindings.length === 0 ? null : (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Things to review</h2>
              </CardTitle>
              <CardDescription>
                These were detected but not calculated, so they are not verified discrepancies.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3">
                {issueFindings.map((f) => (
                  <li
                    key={f.id}
                    className={cn("rounded-md border p-4", TONE_CLASSES[FINDING_STATUS[f.status].tone])}
                  >
                    <p className="font-medium">{issueTitle(f.title)}</p>
                    <p className="text-foreground mt-1 text-sm">
                      {humaniseShiftIds(f.explanation, lines.data?.shifts ?? [])}
                    </p>
                    <p className="text-foreground mt-1 text-sm">{f.nextStep}</p>
                    {f.clauseRefs.length === 0 ? null : (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Award clauses: {f.clauseRefs.join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <PayLines lines={lines} />
        <ShiftBreakdown lines={lines} />

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Assumptions</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm">
                {a.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <AuditVersion audit={a} />
        </div>

        <VerificationNotice />
      </div>
    </>
  );
}

function Amount({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">{detail}</CardContent>
    </Card>
  );
}

function PayLines({ lines }: { lines: ReturnType<typeof useAuditLines> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Rules applied</h2>
        </CardTitle>
        <CardDescription>
          One line per award rule for the whole pay period, as a payslip would show it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {lines.isPending ? (
          <LoadingState rows={2} />
        ) : lines.isError ? (
          <ErrorState error={lines.error} onRetry={() => void lines.refetch()} />
        ) : lines.data.lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hours could be priced for this audit.</p>
        ) : (
          <Table>
            <caption className="sr-only">Pay lines</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden md:table-cell">Award clauses</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.data.lines.map((line) => (
                <TableRow key={line.ruleId}>
                  <TableCell>
                    <span className="font-medium">{line.description}</span>
                    <span className="text-muted-foreground block text-xs">
                      {line.percentOfMinimumHourlyRate}% of {formatAud(line.baseHourlyRate)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line.hours}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAud(line.hourlyRate)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatAud(line.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                    {line.clauseRefs.join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ShiftBreakdown({ lines }: { lines: ReturnType<typeof useAuditLines> }) {
  if (!lines.isSuccess || lines.data.shifts.length === 0) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Shift by shift</h2>
        </CardTitle>
        <CardDescription>
          Per-shift amounts are rounded individually, so they can differ from the pay-period total by a few
          cents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <caption className="sr-only">Shift-by-shift breakdown</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Shift</TableHead>
              <TableHead className="text-right">Paid time</TableHead>
              <TableHead className="text-right">Unpaid breaks</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.data.shifts.map((shift) => (
              <TableRow key={shift.shiftId}>
                <TableCell className="font-medium">
                  {formatShiftSpan(shift.localStart, shift.localEnd)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMinutes(shift.paidMinutes)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMinutes(shift.unpaidBreakMinutes)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {shift.indicativeAmount === null ? "Not priced" : formatAud(shift.indicativeAmount)}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {shift.issueCodes.length === 0 ? "—" : shift.issueCodes.map(issueTitle).join("; ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AuditVersion({ audit }: { audit: AuditDetail }) {
  const rows: [string, string][] = [
    ["Award rule set", audit.ruleSetVersion ?? "None (not calculated)"],
    ["Rule set fingerprint", audit.ruleSetFingerprint === null ? "—" : shortHash(audit.ruleSetFingerprint)],
    ["Calculation engine", audit.engineVersion],
    ["Input fingerprint", shortHash(audit.inputHash)],
    ["Calculated at", formatInstant(audit.calculatedAt)],
    ["Audit id", audit.id],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Audit version</h2>
        </CardTitle>
        <CardDescription>Everything needed to reproduce this result is saved with it.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono text-xs break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
