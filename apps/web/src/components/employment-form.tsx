"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { CheckboxField } from "@/components/checkbox-field";
import { FormField } from "@/components/form-field";
import { FormSection } from "@/components/form-section";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AUSTRALIAN_TIME_ZONES,
  CLASSIFICATIONS,
  EMPTY_EMPLOYMENT_FORM,
  EmploymentFormSchema,
  SPAN_EXCEPTIONS,
  STATES,
  WEEKDAYS,
  WEEKDAY_LABELS,
  type EmploymentFormValues,
} from "@/lib/employment-form";

/**
 * Every fact about a job that changes how its pay is worked out. Used to create an employment and
 * to edit one; past audits keep the terms they were calculated with.
 */
export function EmploymentForm({
  initial = EMPTY_EMPLOYMENT_FORM,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: EmploymentFormValues;
  submitLabel: string;
  onSubmit: (values: EmploymentFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<EmploymentFormValues>({
    resolver: zodResolver(EmploymentFormSchema),
    defaultValues: initial,
  });
  const { errors, isSubmitting } = form.formState;
  const employmentType = form.watch("employmentType");
  const ageBand = form.watch("ageBand");
  const classificationCode = form.watch("classificationCode");
  const classification = CLASSIFICATIONS.find((c) => c.code === classificationCode);
  const stateField = form.register("state");

  return (
    <form className="grid" onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} noValidate>
      <FormSection title="The job" description="What the job is and where it's done.">
        <FormField label="Name" error={errors.label?.message} hint="For example, the store you work at.">
          <Input {...form.register("label")} />
        </FormField>
        <FormField label="Employment type" error={errors.employmentType?.message}>
          <NativeSelect {...form.register("employmentType")}>
            <option value="CASUAL">Casual</option>
            <option value="PART_TIME">Part-time</option>
            <option value="FULL_TIME">Full-time</option>
          </NativeSelect>
        </FormField>
        <FormField
          label="Classification"
          error={errors.classificationCode?.message}
          hint={
            classification === undefined
              ? "Shown on your contract or payslip."
              : `For example: ${classification.example}.`
          }
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
          label="State or territory"
          error={errors.state?.message}
          hint="Decides which public holidays apply."
        >
          <NativeSelect
            {...stateField}
            onChange={(event) => {
              void stateField.onChange(event);
              const state = STATES.find((s) => s.id === event.target.value);
              if (state !== undefined) {
                form.setValue("timeZone", state.timeZone);
              }
            }}
          >
            {STATES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          label="Time zone"
          error={errors.timeZone?.message}
          hint="Used for local times and daylight saving. Broken Hill keeps Adelaide time."
        >
          <NativeSelect {...form.register("timeZone")}>
            {AUSTRALIAN_TIME_ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          label="Workplace hours"
          error={errors.spanException?.message}
          hint="Some workplaces have a longer span of ordinary hours (cl. 15.2)."
        >
          <NativeSelect {...form.register("spanException")}>
            {SPAN_EXCEPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </FormSection>

      <FormSection
        title="Coverage"
        description={
          <>
            Answer &ldquo;Not sure&rdquo; rather than guessing. WageGuard asks for review instead of assuming.
          </>
        }
      >
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
        <FormField label="Were you employed specifically to do shiftwork?" hint="Shift rates are in cl. 25.">
          <NativeSelect {...form.register("shiftworker")}>
            <option value="NO">No</option>
            <option value="YES">Yes</option>
            <option value="UNSURE">Not sure</option>
          </NativeSelect>
        </FormField>
      </FormSection>

      <FormSection
        title="Age and service"
        description="Junior rates depend on your age on each day worked (cl. 17.2). At 20, they also depend on how long you've worked there."
      >
        <FormField label="Were you 21 or older for the whole pay period?">
          <NativeSelect {...form.register("ageBand")}>
            <option value="ADULT_21_PLUS">Yes</option>
            <option value="UNDER_21">No</option>
            <option value="UNSURE">Not sure</option>
          </NativeSelect>
        </FormField>
        <FormField
          label={ageBand === "ADULT_21_PLUS" ? "Date of birth (optional)" : "Date of birth"}
          error={errors.dateOfBirth?.message}
        >
          <Input type="date" {...form.register("dateOfBirth")} />
        </FormField>
        <FormField
          label="Date you started this job (optional)"
          error={errors.employmentStartDate?.message}
          hint="Only used for the age-20 rate."
        >
          <Input type="date" {...form.register("employmentStartDate")} />
        </FormField>
      </FormSection>

      {employmentType === "PART_TIME" ? (
        <FormSection
          title="Guaranteed hours"
          description="From your written part-time agreement (cl. 10.5). Hours beyond these are overtime unless varied in writing."
          columns={1}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {WEEKDAYS.map((day) => (
              <FormField key={day} label={WEEKDAY_LABELS[day]} error={errors.guaranteed?.[day]?.message}>
                <Input inputMode="numeric" placeholder="0:00" {...form.register(`guaranteed.${day}`)} />
              </FormField>
            ))}
          </div>
        </FormSection>
      ) : null}

      <FormSection
        title="Working arrangements"
        description="Tick anything that applies. Each changes how hours are paid."
        columns={1}
      >
        {employmentType === "CASUAL" ? (
          <CheckboxField
            label="I'm a full-time secondary school student"
            hint="Allows shifts as short as 1.5 hours between 3 pm and 6.30 pm on a school day (cl. 11.3)."
            error={errors.schoolStudent?.message}
            {...form.register("schoolStudent")}
          />
        ) : null}
        <CheckboxField
          label="I've agreed to a 10-hour break between work days"
          hint="Instead of the usual 12 hours (cl. 16.6(d))."
          {...form.register("reducedBreakAgreed")}
        />
        <CheckboxField
          label="My hours average 38 a week over a roster cycle"
          hint="Weekly overtime then depends on the whole cycle, so WageGuard asks for review (cl. 15.6(g))."
          {...form.register("averagingRoster")}
        />
        <CheckboxField
          label="I work in baking production"
          hint="Baking production shift rates (cl. 24.2) aren't calculated yet."
          {...form.register("bakingProduction")}
        />
        <CheckboxField
          label="I'm an apprentice or trainee"
          hint="Apprentice and trainee rates (cl. 17.3 to 17.7) aren't calculated yet."
          {...form.register("apprentice")}
        />
      </FormSection>

      <FormSection
        title="Allowances"
        description="Allowances that come with the job (cl. 19). Pay-period claims like cold work or kilometres are entered when you run an audit."
        columns={1}
      >
        <CheckboxField
          label="I launder my own special clothing"
          hint="Laundry allowance (cl. 19.3(c))."
          {...form.register("laundersSpecialClothing")}
        />
        <CheckboxField
          label="I'm the appointed first aider and hold a first aid qualification"
          hint="First aid allowance (cl. 19.10)."
          {...form.register("appointedFirstAider")}
        />
        <CheckboxField
          label="I hold a liquor licence for the business"
          hint="Liquor licence allowance (cl. 19.12)."
          {...form.register("holdsLiquorLicence")}
        />
        <CheckboxField
          label="I work in the County of Yancowinna (Broken Hill)"
          hint="Broken Hill allowance (cl. 19.13)."
          {...form.register("brokenHill")}
        />
      </FormSection>

      <div className="mt-2 flex flex-wrap gap-2 border-t pt-6">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
