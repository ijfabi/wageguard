"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { CreatePayslipRequest } from "@wageguard/api-contracts";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import { useCreatePayslip, useEmployments } from "@/lib/api/hooks";
import { isMoneyString, sumMoney, formatAud } from "@/lib/money";
import { PAYSLIP_CATEGORY_LABELS, PayslipFormSchema } from "@/lib/payslip-form";

export default function NewPayslipPage() {
  const employments = useEmployments();
  const params = useSearchParams();

  if (employments.isPending) {
    return <LoadingState />;
  }
  if (employments.isError) {
    return <ErrorState error={employments.error} onRetry={() => void employments.refetch()} />;
  }
  if (employments.data.items.length === 0) {
    return (
      <EmptyState
        title="Add an employment first"
        description="A payslip belongs to an employment."
        action={
          <Button asChild>
            <Link href="/employments">Add employment</Link>
          </Button>
        }
      />
    );
  }
  return (
    <>
      <PageHeader
        title="Enter a payslip"
        description="Copy the figures exactly as they appear on your payslip. Gross pay is before tax and super."
      />
      <PayslipForm
        employments={employments.data.items.map((e) => ({ id: e.id, label: e.label }))}
        defaultEmploymentId={params.get("employmentId") ?? employments.data.items[0]?.id ?? ""}
      />
    </>
  );
}

function PayslipForm({
  employments,
  defaultEmploymentId,
}: {
  employments: { id: string; label: string }[];
  defaultEmploymentId: string;
}) {
  const create = useCreatePayslip();
  const router = useRouter();
  const form = useForm<CreatePayslipRequest>({
    resolver: zodResolver(PayslipFormSchema),
    defaultValues: {
      employmentId: defaultEmploymentId,
      payPeriod: { startDate: "", endDate: "" },
      grossPay: "",
      lines: [],
    },
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const { errors, isSubmitting } = form.formState;
  const amounts = form.watch("lines").map((l) => l.amount);
  const runningTotal = amounts.every((a) => a.trim() === "" || isMoneyString(a)) ? sumMoney(amounts) : null;

  async function onSubmit(values: CreatePayslipRequest) {
    try {
      const payslip = await create.mutateAsync(values);
      toast.success("Payslip saved");
      router.push(`/audits/new?employmentId=${values.employmentId}&payslipId=${payslip.id}`);
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card>
      <CardContent>
        <form className="grid gap-5" onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} noValidate>
          <div className="grid gap-4 md:grid-cols-4">
            <FormField label="Employment" error={errors.employmentId?.message}>
              <NativeSelect {...form.register("employmentId")}>
                {employments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Pay period start" error={errors.payPeriod?.startDate?.message}>
              <Input type="date" {...form.register("payPeriod.startDate")} />
            </FormField>
            <FormField label="Pay period end" error={errors.payPeriod?.endDate?.message}>
              <Input type="date" {...form.register("payPeriod.endDate")} />
            </FormField>
            <FormField
              label="Gross pay ($)"
              error={errors.grossPay?.message}
              hint="Before tax and super, e.g. 862.15"
            >
              <Input inputMode="decimal" placeholder="0.00" {...form.register("grossPay")} />
            </FormField>
          </div>

          <fieldset className="rounded-lg border p-4">
            <legend className="px-1 text-sm font-semibold">Itemised lines (optional, recommended)</legend>
            <p className="text-muted-foreground mb-3 text-xs">
              With lines, WageGuard compares only pay for hours worked and lists allowances and leave
              separately. Without lines, the whole gross is compared.
            </p>
            <ul className="grid gap-3">
              {lines.fields.map((field, index) => (
                <li key={field.id} className="grid items-end gap-3 md:grid-cols-[14rem_1fr_9rem_auto]">
                  <FormField
                    label={`Line ${index + 1} type`}
                    error={errors.lines?.[index]?.category?.message}
                  >
                    <NativeSelect {...form.register(`lines.${index}.category`)}>
                      {Object.entries(PAYSLIP_CATEGORY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField
                    label={`Line ${index + 1} description`}
                    error={errors.lines?.[index]?.description?.message}
                  >
                    <Input {...form.register(`lines.${index}.description`)} />
                  </FormField>
                  <FormField
                    label={`Line ${index + 1} amount ($)`}
                    error={errors.lines?.[index]?.amount?.message}
                  >
                    <Input inputMode="decimal" {...form.register(`lines.${index}.amount`)} />
                  </FormField>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      lines.remove(index);
                    }}
                    aria-label={`Remove line ${index + 1}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  lines.append({ category: "HOURS_WORKED", description: "", amount: "" });
                }}
              >
                <Plus className="size-4" aria-hidden />
                Add line
              </Button>
              {lines.fields.length > 0 && runningTotal !== null ? (
                <p className="text-muted-foreground text-sm" aria-live="polite">
                  Lines total {formatAud(runningTotal)}
                </p>
              ) : null}
            </div>
            {errors.lines?.root?.message === undefined && errors.lines?.message === undefined ? null : (
              <p role="alert" className="text-danger mt-2 text-sm">
                {errors.lines.root?.message ?? errors.lines.message}
              </p>
            )}
          </fieldset>

          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save payslip and continue"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
