"use client";

import type { EmploymentResponse, ShiftResponse } from "@wageguard/api-contracts";
import { CalendarClock, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { PageHeader } from "@/components/page-header";
import { ShiftForm } from "@/components/shift-form";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { TablePanel } from "@/components/table-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiRequestError, errorMessage } from "@/lib/api/client";
import { useEmployments, useShifts, useUpdateShift } from "@/lib/api/hooks";
import { formatShiftSpan, formatTime } from "@wageguard/presentation";
import { fromShiftResponse, toShiftTimes, type ShiftFormValues } from "@/lib/shift-form";

export default function ShiftsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const employmentId = params.get("employmentId") ?? undefined;
  const employments = useEmployments();
  const shifts = useShifts(employmentId === undefined ? {} : { employmentId });
  const [editing, setEditing] = useState<ShiftResponse | null>(null);
  const rows = shifts.data?.pages.flatMap((p) => p.items) ?? [];
  const employmentById = new Map((employments.data?.items ?? []).map((e) => [e.id, e]));

  return (
    <>
      <PageHeader
        title="Shifts"
        description="Your recorded shifts, oldest first."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/shifts/import">
                <Upload aria-hidden />
                Import CSV
              </Link>
            </Button>
            <Button asChild>
              <Link
                href={employmentId === undefined ? "/shifts/new" : `/shifts/new?employmentId=${employmentId}`}
              >
                <Plus aria-hidden />
                Record a shift
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex max-w-sm items-center gap-3">
        <Label htmlFor="employment-filter" className="shrink-0">
          Employment
        </Label>
        <NativeSelect
          id="employment-filter"
          value={employmentId ?? ""}
          onChange={(e) => {
            router.replace(e.target.value === "" ? "/shifts" : `/shifts?employmentId=${e.target.value}`);
          }}
        >
          <option value="">All employments</option>
          {(employments.data?.items ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {shifts.isPending ? (
        <LoadingState label="Loading shifts" />
      ) : shifts.isError ? (
        <ErrorState error={shifts.error} onRetry={() => void shifts.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No shifts recorded"
          description="Record shifts one at a time or import a timesheet CSV."
          action={
            <Button asChild>
              <Link href="/shifts/import">Import CSV</Link>
            </Button>
          }
        />
      ) : (
        <>
          <TablePanel>
            <Table>
              <caption className="sr-only">Recorded shifts</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Shift</TableHead>
                  <TableHead className="hidden sm:table-cell">Employment</TableHead>
                  <TableHead className="hidden md:table-cell">Breaks</TableHead>
                  <TableHead className="sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="whitespace-normal sm:whitespace-nowrap">
                      <span className="font-medium">{formatShiftSpan(shift.start, shift.end)}</span>
                      {/* On narrow screens the employment and breaks fold in under the shift. */}
                      <span className="text-muted-foreground block text-xs sm:hidden">
                        {employmentById.get(shift.employmentId)?.label ?? "—"}
                      </span>
                      <span className="text-muted-foreground block text-xs md:hidden">
                        Breaks: {describeBreaks(shift)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {employmentById.get(shift.employmentId)?.label ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                      {describeBreaks(shift)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(shift);
                        }}
                        aria-label={`Edit shift ${formatShiftSpan(shift.start, shift.end)}`}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TablePanel>
          {shifts.hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => void shifts.fetchNextPage()}
                disabled={shifts.isFetchingNextPage}
              >
                {shifts.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <EditShiftDialog
        shift={editing}
        employments={employments.data?.items ?? []}
        onClose={() => {
          setEditing(null);
        }}
      />
    </>
  );
}

/** "Meal 12:00 pm–12:30 pm, Rest 3:00 pm–3:10 pm", or "None". */
function describeBreaks(shift: ShiftResponse): string {
  return shift.breaks.length === 0
    ? "None"
    : shift.breaks
        .map(
          (b) =>
            `${b.kind === "UNPAID_MEAL" ? "Meal" : "Rest"} ${formatTime(b.start.slice(11))}–${formatTime(b.end.slice(11))}`,
        )
        .join(", ");
}

function EditShiftDialog({
  shift,
  employments,
  onClose,
}: {
  shift: ShiftResponse | null;
  employments: readonly EmploymentResponse[];
  onClose: () => void;
}) {
  const update = useUpdateShift();

  async function onSubmit(values: ShiftFormValues) {
    if (shift === null) {
      return;
    }
    try {
      const timeZone = employments.find((e) => e.id === shift.employmentId)?.timeZone;
      await update.mutateAsync({
        id: shift.id,
        body: { version: shift.version, ...toShiftTimes(values, timeZone) },
      });
      toast.success("Shift updated");
      onClose();
    } catch (error: unknown) {
      toast.error(
        error instanceof ApiRequestError && error.code === "VERSION_CONFLICT"
          ? "This shift was changed elsewhere. Close this window and reload to see the latest version."
          : errorMessage(error),
      );
    }
  }

  return (
    <Dialog
      open={shift !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit shift</DialogTitle>
          <DialogDescription>
            Existing audits are not affected: they keep the shift as it was when they ran.
          </DialogDescription>
        </DialogHeader>
        {shift === null ? null : (
          <ShiftForm
            key={`${shift.id}-${shift.version}`}
            employments={employments}
            initial={fromShiftResponse(shift, employments.find((e) => e.id === shift.employmentId)?.timeZone)}
            submitLabel="Save changes"
            lockEmployment
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
