"use client";

import type { AuditDetail } from "@wageguard/api-contracts";
import { Download, FileJson, FileSearch } from "lucide-react";
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
import {
  auditAmounts,
  formatAud,
  formatDate,
  formatInstant,
  formatMinutes,
  formatShiftSpan,
  humaniseShiftIds,
  shortHash,
} from "@wageguard/presentation";
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
            <Button variant="outline" onClick={() => void downloadReport()} disabled={downloading}>
              <FileJson className="size-4" aria-hidden />
              {downloading ? "Preparing…" : "Download JSON"}
            </Button>
            {/* Same-origin link: the browser sends the session cookie and saves the attachment. */}
            <Button asChild>
              <a href={`/api/v1/audits/${a.id}/report/pdf`} download>
                <Download className="size-4" aria-hidden />
                Download PDF report
              </a>
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
          {auditAmounts(a).map((amount) => (
            <Amount key={amount.label} {...amount} />
          ))}
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
                <TableHead className="hidden text-right sm:table-cell">Hours</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden md:table-cell">Award clauses</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.data.lines.map((line) => (
                <TableRow key={line.ruleId}>
                  <TableCell className="whitespace-normal">
                    <span className="font-medium">{line.description}</span>
                    <span className="text-muted-foreground block text-xs">
                      {line.percentOfMinimumHourlyRate}% of {formatAud(line.baseHourlyRate)}
                      {/* Hours and rate have their own columns from the sm breakpoint up. */}
                      <span className="sm:hidden">
                        {" "}
                        · {line.hours} h at {formatAud(line.hourlyRate)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{line.hours}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatAud(line.hourlyRate)}
                  </TableCell>
                  <TableCell className="text-right align-top font-medium tabular-nums sm:align-middle">
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
              <TableHead className="hidden text-right sm:table-cell">Paid time</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Unpaid breaks</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="hidden md:table-cell">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.data.shifts.map((shift) => (
              <TableRow key={shift.shiftId}>
                <TableCell className="whitespace-normal sm:whitespace-nowrap">
                  <span className="font-medium">{formatShiftSpan(shift.localStart, shift.localEnd)}</span>
                  {/* On narrow screens the time columns and notes fold in under the shift. */}
                  <span className="text-muted-foreground block text-xs sm:hidden">
                    {formatMinutes(shift.paidMinutes)} paid, {formatMinutes(shift.unpaidBreakMinutes)} unpaid
                    break
                  </span>
                  {shift.issueCodes.length === 0 ? null : (
                    <span className="text-muted-foreground block text-xs md:hidden">
                      {shift.issueCodes.map(issueTitle).join("; ")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatMinutes(shift.paidMinutes)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatMinutes(shift.unpaidBreakMinutes)}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums sm:align-middle">
                  {shift.indicativeAmount === null ? "Not priced" : formatAud(shift.indicativeAmount)}
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
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
