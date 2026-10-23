import type { AuditSummary } from "@wageguard/api-contracts";
import Link from "next/link";

import { FindingStatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatInstant } from "@/lib/format";
import { formatAud, formatDifference } from "@/lib/money";

/** Audit summaries as a table; each row links to the audit detail. */
export function AuditTable({ audits, caption }: { audits: readonly AuditSummary[]; caption: string }) {
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Pay period</TableHead>
          <TableHead>Result</TableHead>
          <TableHead className="text-right">Calculated minimum</TableHead>
          <TableHead className="text-right">Reported</TableHead>
          <TableHead className="text-right">Difference</TableHead>
          <TableHead className="hidden md:table-cell">Run</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {audits.map((audit) => (
          <TableRow key={audit.id}>
            <TableCell>
              <Link
                className="text-primary font-medium underline-offset-4 hover:underline"
                href={`/audits/${audit.id}`}
              >
                {formatDate(audit.payPeriod.startDate)} – {formatDate(audit.payPeriod.endDate)}
              </Link>
            </TableCell>
            <TableCell>
              <FindingStatusBadge status={audit.findingStatus} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {audit.expectedAmount === null ? "—" : formatAud(audit.expectedAmount)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatAud(audit.reportedAmount)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {audit.difference === null ? "—" : formatDifference(audit.difference)}
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
              {formatInstant(audit.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
