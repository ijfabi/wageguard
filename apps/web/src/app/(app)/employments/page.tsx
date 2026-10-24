"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import { useCreateEmployment, useEmployments } from "@/lib/api/hooks";
import {
  AUSTRALIAN_TIME_ZONES,
  CLASSIFICATIONS,
  EMPLOYMENT_TYPE_LABELS,
  EMPTY_EMPLOYMENT_FORM,
  EmploymentFormSchema,
  WEEKDAYS,
  WEEKDAY_LABELS,
  classificationLabel,
  toCreateEmploymentRequest,
  type EmploymentFormValues,
} from "@/lib/employment-form";

export default function EmploymentsPage() {
  const employments = useEmployments();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Employment"
        description="Describe each job you want to check. WageGuard never assumes award coverage from a job title."
        actions={
          creating ? undefined : (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              Add employment
            </Button>
          )
        }
      />
      {creating ? (
        <EmploymentForm
          onDone={() => {
            setCreating(false);
          }}
        />
      ) : null}
      <section aria-label="Your employments" className="mt-6">
        {employments.isPending ? (
          <LoadingState label="Loading employments" />
        ) : employments.isError ? (
          <ErrorState error={employments.error} onRetry={() => void employments.refetch()} />
        ) : employments.data.items.length === 0 ? (
          creating ? null : (
            <EmptyState
              title="No employment yet"
              description="Add the job you want to check. You can add more than one."
              action={
                <Button
                  onClick={() => {
                    setCreating(true);
                  }}
                >
                  Add employment
                </Button>
              }
            />
          )
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {employments.data.items.map((e) => (
              <li key={e.id}>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <Link className="text-primary hover:underline" href={`/employments/${e.id}`}>
                        {e.label}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {EMPLOYMENT_TYPE_LABELS[e.employmentType]} · {classificationLabel(e.classificationCode)}{" "}
                      · {e.timeZone}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function EmploymentForm({ onDone }: { onDone: () => void }) {
  const create = useCreateEmployment();
  const form = useForm<EmploymentFormValues>({
    resolver: zodResolver(EmploymentFormSchema),
    defaultValues: EMPTY_EMPLOYMENT_FORM,
  });
  const { errors, isSubmitting } = form.formState;
  const partTime = form.watch("employmentType") === "PART_TIME";

  async function onSubmit(values: EmploymentFormValues) {
    try {
      await create.mutateAsync(toCreateEmploymentRequest(values));
      toast.success("Employment added");
      onDone();
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>New employment</h2>
        </CardTitle>
        <CardDescription>
          General Retail Industry Award 2020 (MA000004). Answer &ldquo;Not sure&rdquo; rather than guessing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} noValidate>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Name" error={errors.label?.message} hint="For example, the store you work at.">
              <Input {...form.register("label")} />
            </FormField>
            <FormField label="Employment type" error={errors.employmentType?.message}>
              <NativeSelect {...form.register("employmentType")}>
                <option value="CASUAL">Casual</option>
                <option value="PART_TIME">Part-time</option>
                <option value="FULL_TIME">Full-time (not yet supported)</option>
              </NativeSelect>
            </FormField>
            <FormField
              label="Classification"
              error={errors.classificationCode?.message}
              hint="Shown on your contract or payslip."
            >
              <NativeSelect {...form.register("classificationCode")}>
                {CLASSIFICATIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              label="Where you work"
              error={errors.timeZone?.message}
              hint="Used for local times and daylight saving."
            >
              <NativeSelect {...form.register("timeZone")}>
                {AUSTRALIAN_TIME_ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>

          <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
            <legend className="float-left w-full text-sm font-semibold md:col-span-2">About this job</legend>
            <FormField
              label="Is this job covered by the General Retail Industry Award?"
              hint="Check with the Fair Work 'Find my award' tool if unsure."
            >
              <NativeSelect {...form.register("awardCoverage")}>
                <option value="CONFIRMED">Yes, I have confirmed it</option>
                <option value="UNSURE">Not sure</option>
              </NativeSelect>
            </FormField>
            <FormField label="Does an enterprise agreement apply?">
              <NativeSelect {...form.register("enterpriseAgreement")}>
                <option value="NONE">No</option>
                <option value="APPLIES">Yes</option>
                <option value="UNSURE">Not sure</option>
              </NativeSelect>
            </FormField>
            <FormField label="Were you 21 or older for the whole pay period?">
              <NativeSelect {...form.register("ageBand")}>
                <option value="ADULT_21_PLUS">Yes</option>
                <option value="UNDER_21">No</option>
                <option value="UNSURE">Not sure</option>
              </NativeSelect>
            </FormField>
            <FormField label="Were you employed specifically to do shiftwork?">
              <NativeSelect {...form.register("shiftworker")}>
                <option value="NO">No</option>
                <option value="YES">Yes</option>
                <option value="UNSURE">Not sure</option>
              </NativeSelect>
            </FormField>
          </fieldset>

          {partTime ? (
            <fieldset className="rounded-lg border p-4 [&>legend+*]:clear-both">
              <legend className="float-left mb-3 w-full text-sm font-semibold">
                Guaranteed hours (from your written part-time agreement)
              </legend>
              <p className="text-muted-foreground mb-3 text-xs">
                Hours:minutes per day. Leave a day blank if you have no guaranteed hours that day.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {WEEKDAYS.map((day) => (
                  <FormField key={day} label={WEEKDAY_LABELS[day]} error={errors.guaranteed?.[day]?.message}>
                    <Input inputMode="numeric" placeholder="0:00" {...form.register(`guaranteed.${day}`)} />
                  </FormField>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save employment"}
            </Button>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
