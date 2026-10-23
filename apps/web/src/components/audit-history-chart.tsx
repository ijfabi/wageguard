"use client";

import type { DashboardResponse } from "@wageguard/api-contracts";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMonth } from "@wageguard/presentation";
import { FINDING_STATUS, type FindingStatus } from "@/lib/status";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type Month = DashboardResponse["history"][number];

/**
 * Audits per month: a single series, so one hue (validated --chart-1), no legend, thin bars with
 * rounded tops, a recessive grid, a per-bar tooltip with the status breakdown, and an equivalent
 * table view so nothing depends on colour or hovering.
 */
export function AuditHistoryChart({ history }: { history: Month[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const reducedMotion = useReducedMotion();
  const data = history.map((m) => ({ ...m, label: formatMonth(m.month) }));
  const total = history.reduce((sum, m) => sum + m.total, 0);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setView(view === "chart" ? "table" : "chart");
          }}
          aria-pressed={view === "table"}
        >
          {view === "chart" ? "View as table" : "View as chart"}
        </Button>
      </div>
      {view === "chart" ? (
        <figure aria-label={`Audits per month over the last ${history.length} months: ${total} in total.`}>
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  width={40}
                />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={HistoryTooltip} />
                <Bar
                  dataKey="total"
                  name="Audits"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!reducedMotion}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Audits</TableHead>
              <TableHead className="text-right">Potential underpayments</TableHead>
              <TableHead className="text-right">Need review or not supported</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((m) => (
              <TableRow key={m.month}>
                <TableCell>{formatMonth(m.month)}</TableCell>
                <TableCell className="text-right tabular-nums">{m.total}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.byFindingStatus.POTENTIAL_UNDERPAYMENT}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.byFindingStatus.REVIEW_REQUIRED +
                    m.byFindingStatus.INCOMPLETE_DATA +
                    m.byFindingStatus.UNSUPPORTED_SCENARIO}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function HistoryTooltip({ active, payload }: TooltipContentProps) {
  const month = payload[0]?.payload as (Month & { label: string }) | undefined;
  if (!active || month === undefined) {
    return null;
  }
  const rows = (Object.entries(month.byFindingStatus) as [FindingStatus, number][]).filter(([, n]) => n > 0);
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
      <p className="font-medium">
        {month.label}: {month.total} {month.total === 1 ? "audit" : "audits"}
      </p>
      {rows.length === 0 ? null : (
        <ul className="text-muted-foreground mt-1 space-y-0.5">
          {rows.map(([status, n]) => (
            <li key={status}>
              {FINDING_STATUS[status].label}: <span className="text-foreground tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
