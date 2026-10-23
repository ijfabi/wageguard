"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type SyntheticEvent } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { VerificationNotice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api/client";
import { useCreateAudit, useEmployments, usePayslips } from "@/lib/api/hooks";
import { formatAud, formatDate } from "@wageguard/presentation";

export default function NewAuditPage() {
  const params = useSearchParams();
  const router = useRouter();
  const employments = useEmployments();
  const [employmentId, setEmploymentId] = useState(params.get("employmentId") ?? "");
  const selectedEmployment = employmentId === "" ? (employments.data?.items[0]?.id ?? "") : employmentId;
  const payslips = usePayslips(selectedEmployment === "" ? undefined : selectedEmployment);
  const [payslipId, setPayslipId] = useState(params.get("payslipId") ?? "");
  const [holidays, setHolidays] = useState<string[]>([]);
  const createAudit = useCreateAudit();
  // One key per audit attempt. A retry after a network failure reuses it, so the server can never
  // create two audits for one submission; a new key is issued only after a successful run.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const availablePayslips = payslips.data?.items ?? [];
  const selectedPayslip = payslipId === "" ? availablePayslips[0]?.id : payslipId;

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedEmployment === "" || selectedPayslip === undefined) {
      return;
    }
    try {
      const declared = holidays.filter((h) => h !== "");
      const audit = await createAudit.mutateAsync({
        body: {
          employmentId: selectedEmployment,
          payslipId: selectedPayslip,
          ...(declared.length === 0 ? {} : { declaredPublicHolidays: declared }),
        },
        idempotencyKey,
      });
      setIdempotencyKey(crypto.randomUUID());
      router.push(`/audits/${audit.id}`);
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    }
  }

  if (employments.isPending) {
    return <LoadingState />;
  }
  if (employments.isError) {
    return <ErrorState error={employments.error} onRetry={() => void employments.refetch()} />;
  }
  if (employments.data.items.length === 0) {
    return (
      <>
        <PageHeader title="Run an audit" />
        <EmptyState
          title="Add an employment first"
          description="An audit compares a payslip with the shifts recorded for one employment."
          action={
            <Button asChild>
              <Link href="/employments">Add employment</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Run an audit"
        description="WageGuard uses every shift you recorded that starts within the payslip's pay period."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardContent>
            <form className="grid gap-5" onSubmit={(e) => void onSubmit(e)}>
              <div className="grid gap-1.5">
                <Label htmlFor="audit-employment">Employment</Label>
                <NativeSelect
                  id="audit-employment"
                  value={selectedEmployment}
                  onChange={(e) => {
                    setEmploymentId(e.target.value);
                    setPayslipId("");
                  }}
                >
                  {employments.data.items.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="audit-payslip">Payslip</Label>
                {payslips.isPending ? (
                  <LoadingState rows={1} label="Loading payslips" />
                ) : availablePayslips.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No payslips for this employment.{" "}
                    <Link
                      className="text-primary underline"
                      href={`/payslips/new?employmentId=${selectedEmployment}`}
                    >
                      Enter one
                    </Link>
                    .
                  </p>
                ) : (
                  <NativeSelect
                    id="audit-payslip"
                    value={selectedPayslip}
                    onChange={(e) => {
                      setPayslipId(e.target.value);
                    }}
                  >
                    {availablePayslips.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatDate(p.payPeriod.startDate)} – {formatDate(p.payPeriod.endDate)} ·{" "}
                        {formatAud(p.grossPay)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </div>

              <fieldset className="rounded-lg border p-4">
                <legend className="px-1 text-sm font-semibold">
                  Public holidays in this pay period (optional)
                </legend>
                <p className="text-muted-foreground mb-3 text-xs">
                  WageGuard does not know your state&rsquo;s public holidays. Add any you worked; those hours
                  are flagged for review rather than calculated.
                </p>
                <ul className="grid gap-2">
                  {holidays.map((value, index) => (
                    <li key={index} className="flex items-end gap-2">
                      <div className="grid gap-1.5">
                        <Label htmlFor={`holiday-${index}`}>Public holiday {index + 1}</Label>
                        <Input
                          id={`holiday-${index}`}
                          type="date"
                          value={value}
                          onChange={(e) => {
                            setHolidays(holidays.map((h, i) => (i === index ? e.target.value : h)));
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setHolidays(holidays.filter((_, i) => i !== index));
                        }}
                        aria-label={`Remove public holiday ${index + 1}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setHolidays([...holidays, ""]);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add public holiday
                </Button>
              </fieldset>

              <div>
                <Button type="submit" disabled={selectedPayslip === undefined || createAudit.isPending}>
                  {createAudit.isPending ? "Running audit…" : "Run audit"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Before you run it</h2>
            </CardTitle>
            <CardDescription>
              Make sure every shift in the pay period has been recorded, with its meal breaks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerificationNotice />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
