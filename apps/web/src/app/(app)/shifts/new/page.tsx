"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ShiftForm } from "@/components/shift-form";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { errorMessage } from "@/lib/api/client";
import { useCreateShift, useEmployments } from "@/lib/api/hooks";
import { toShiftTimes, type ShiftFormValues } from "@/lib/shift-form";

export default function NewShiftPage() {
  const employments = useEmployments();
  const create = useCreateShift();
  const router = useRouter();
  const params = useSearchParams();

  async function onSubmit(values: ShiftFormValues) {
    try {
      const timeZone = employments.data?.items.find((e) => e.id === values.employmentId)?.timeZone;
      await create.mutateAsync({ employmentId: values.employmentId, ...toShiftTimes(values, timeZone) });
      toast.success("Shift saved");
      router.push(`/shifts?employmentId=${values.employmentId}`);
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <PageHeader
        title="Record a shift"
        description="Enter the times as they appear on your timesheet, in local time."
      />
      {employments.isPending ? (
        <LoadingState />
      ) : employments.isError ? (
        <ErrorState error={employments.error} onRetry={() => void employments.refetch()} />
      ) : employments.data.items.length === 0 ? (
        <EmptyState
          title="Add an employment first"
          description="Shifts belong to an employment."
          action={
            <Button asChild>
              <Link href="/employments">Add employment</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent>
            <ShiftForm
              employments={employments.data.items}
              initial={{
                employmentId: params.get("employmentId") ?? employments.data.items[0]?.id ?? "",
                date: "",
                start: "09:00",
                end: "17:00",
                mealStart: "",
                mealEnd: "",
                restBreaks: [],
                startOccurrence: "",
                endOccurrence: "",
              }}
              submitLabel="Save shift"
              onSubmit={onSubmit}
              onCancel={() => {
                router.back();
              }}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
