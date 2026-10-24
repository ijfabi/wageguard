"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { EmploymentResponse } from "@wageguard/api-contracts";
import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";

import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShiftFormSchema, type ShiftFormValues } from "@/lib/shift-form";

interface ShiftFormProps {
  readonly employments: readonly EmploymentResponse[];
  readonly initial: ShiftFormValues;
  readonly submitLabel: string;
  /** Edits cannot move a shift to another employment (the API forbids it). */
  readonly lockEmployment?: boolean;
  readonly onSubmit: (values: ShiftFormValues) => Promise<void>;
  readonly onCancel?: () => void;
}

/** Date + wall-clock times, as on a timesheet. An end time earlier than the start means the next day. */
export function ShiftForm({
  employments,
  initial,
  submitLabel,
  lockEmployment = false,
  onSubmit,
  onCancel,
}: ShiftFormProps) {
  const form = useForm<ShiftFormValues>({ resolver: zodResolver(ShiftFormSchema), defaultValues: initial });
  const rests = useFieldArray({ control: form.control, name: "restBreaks" });
  const { errors, isSubmitting } = form.formState;

  return (
    <form className="grid gap-5" onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} noValidate>
      <div className="grid gap-4 md:grid-cols-4">
        <FormField label="Employment" error={errors.employmentId?.message}>
          <NativeSelect disabled={lockEmployment} {...form.register("employmentId")}>
            <option value="">Choose…</option>
            {employments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Date" error={errors.date?.message} hint="The day the shift started.">
          <Input type="date" {...form.register("date")} />
        </FormField>
        <FormField label="Start" error={errors.start?.message}>
          <Input type="time" {...form.register("start")} />
        </FormField>
        <FormField
          label="Finish"
          error={errors.end?.message}
          hint="Earlier than the start means the next day."
        >
          <Input type="time" {...form.register("end")} />
        </FormField>
      </div>

      <fieldset className="rounded-lg border p-4 [&>legend+*]:clear-both">
        <legend className="float-left mb-3 w-full text-sm font-semibold">Unpaid meal break (optional)</legend>
        <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
          <FormField label="Meal break start" error={errors.mealStart?.message}>
            <Input type="time" {...form.register("mealStart")} />
          </FormField>
          <FormField label="Meal break end" error={errors.mealEnd?.message}>
            <Input type="time" {...form.register("mealEnd")} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border p-4 [&>legend+*]:clear-both">
        <legend className="float-left mb-3 w-full text-sm font-semibold">Paid rest breaks (optional)</legend>
        <p className="text-muted-foreground mb-3 text-xs">
          Rest breaks are paid time, so they do not change the calculated pay.
        </p>
        <ul className="grid gap-3">
          {rests.fields.map((field, index) => (
            <li key={field.id} className="flex flex-wrap items-end gap-3">
              <FormField
                label={`Rest break ${index + 1} start`}
                error={errors.restBreaks?.[index]?.start?.message}
              >
                <Input type="time" {...form.register(`restBreaks.${index}.start`)} />
              </FormField>
              <FormField
                label={`Rest break ${index + 1} end`}
                error={errors.restBreaks?.[index]?.end?.message}
              >
                <Input type="time" {...form.register(`restBreaks.${index}.end`)} />
              </FormField>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  rests.remove(index);
                }}
                aria-label={`Remove rest break ${index + 1}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        {rests.fields.length < 4 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              rests.append({ start: "", end: "" });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add rest break
          </Button>
        ) : null}
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        {onCancel === undefined ? null : (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
