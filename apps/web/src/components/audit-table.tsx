import type { AuditSummary } from "@wageguard/api-contracts";
import Link from "next/link";

import { FindingStatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  formatAud,
  formatDate,
  formatDifference,
  formatInstant,
  nothingPriced,
} from "@wageguard/presentation";

/**
 * Audit summaries as a table; each row links to the audit detail. On narrow screens the result
 * badge moves under the pay period and the amount columns give way to the difference alone, so
 * nothing is cut off at the screen edge.
 */
export function AuditTable({ audits, caption }: { audits: readonly AuditSummary[]; caption: string }) {
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Pay period</TableHead>
          <TableHead className="hidden sm:table-cell">Result</TableHead>
          <TableHead className="hidden text-right md:table-cell">Calculated minimum</TableHead>
          <TableHead className="hidden text-right md:table-cell">Reported</TableHead>
          <TableHead className="text-right">Difference</TableHead>
          <TableHead className="hidden lg:table-cell">Run</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {audits.map((audit) => (
          <TableRow key={audit.id}>
            <TableCell className="whitespace-normal sm:whitespace-nowrap">
              <Link
                className="text-primary font-medium underline-offset-4 hover:underline"
                href={`/audits/${audit.id}`}
              >
                {formatDate(audit.payPeriod.startDate)} – {formatDate(audit.payPeriod.endDate)}
              </Link>
              <div className="mt-1.5 sm:hidden">
                <FindingStatusBadge status={audit.findingStatus} />
              </div>
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <FindingStatusBadge status={audit.findingStatus} />
            </TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">
              {audit.expectedAmount === null || nothingPriced(audit) ? "—" : formatAud(audit.expectedAmount)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">
              {formatAud(audit.reportedAmount)}
            </TableCell>
            <TableCell className="text-right align-top tabular-nums sm:align-middle">
              {audit.difference === null || nothingPriced(audit) ? "—" : formatDifference(audit.difference)}
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-sm lg:table-cell">
              {formatInstant(audit.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
