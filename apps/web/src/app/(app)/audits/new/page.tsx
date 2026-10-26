"use client";

import type { AuditPublicHoliday, CreateAuditRequest, LeaveEntry } from "@wageguard/api-contracts";
import { CalendarDays, ChevronDown, FileSearch, Plus, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode, type SyntheticEvent } from "react";
import { toast } from "sonner";

import { FormSection } from "@/components/form-section";
import { NativeSelect } from "@/components/native-select";
import { VerificationNotice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api/client";
import { useCreateAudit, useEmployments, usePayslips, usePublicHolidays } from "@/lib/api/hooks";
import { parseDuration, stateLabel } from "@/lib/employment-form";
import { formatAud, formatDate } from "@wageguard/presentation";

interface ExtraHoliday {
  date: string;
  from: string;
  name: string;
}
interface Variation {
  date: string;
  hours: string;
}
interface LeaveRow {
  kind: LeaveEntry["kind"];
  hours: string;
}

const LEAVE_KINDS: readonly { id: LeaveEntry["kind"]; label: string }[] = [
  { id: "ANNUAL", label: "Annual leave" },
  { id: "PERSONAL_CARERS", label: "Personal or carer's leave" },
  { id: "COMPASSIONATE", label: "Compassionate leave" },
  { id: "PUBLIC_HOLIDAY_NOT_WORKED", label: "Public holiday not worked" },
];

/** "7:30" -> 450; anything unparseable -> null, so a half-typed value is simply not sent yet. */
function minutesOf(value: string): number | null {
  try {
    return parseDuration(value);
  } catch {
    return null;
  }
}

export default function NewAuditPage() {
  const params = useSearchParams();
  const router = useRouter();
  const employments = useEmployments();
  const [employmentId, setEmploymentId] = useState(params.get("employmentId") ?? "");
  const selectedEmploymentId = employmentId === "" ? (employments.data?.items[0]?.id ?? "") : employmentId;
  const employment = employments.data?.items.find((e) => e.id === selectedEmploymentId);
  const payslips = usePayslips(selectedEmploymentId === "" ? undefined : selectedEmploymentId);
  const [payslipId, setPayslipId] = useState(params.get("payslipId") ?? "");
  const availablePayslips = payslips.data?.items ?? [];
  const payslip = availablePayslips.find((p) => p.id === payslipId) ?? availablePayslips[0];

  const holidays = usePublicHolidays(
    employment?.state === null || employment === undefined || payslip === undefined
      ? null
      : { state: employment.state, from: payslip.payPeriod.startDate, to: payslip.payPeriod.endDate },
  );
  // Holidays the user unticked, keyed by date. Everything state-wide starts ticked.
  const [unticked, setUnticked] = useState<Record<string, boolean>>({});
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [extraHolidays, setExtraHolidays] = useState<ExtraHoliday[]>([]);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [leave, setLeave] = useState<LeaveRow[]>([]);
  const [coldWork, setColdWork] = useState("");
  const [belowZero, setBelowZero] = useState("");
  const [kilometres, setKilometres] = useState("");
  const [mealDates, setMealDates] = useState<string[]>([]);

  const createAudit = useCreateAudit();
  // One key per audit attempt. A retry after a network failure reuses it, so the server can never
  // create two audits for one submission; a new key is issued only after a successful run.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const calendar = holidays.data?.holidays ?? [];
  const isOn = (h: (typeof calendar)[number]) =>
    h.scope === "STATEWIDE" ? unticked[h.date] !== true : ticked[h.date] === true;
  const years =
    payslip === undefined
      ? []
      : [payslip.payPeriod.startDate, payslip.payPeriod.endDate].map((d) => Number(d.slice(0, 4)));
  const uncovered = holidays.data !== undefined && years.some((y) => !holidays.data.coveredYears.includes(y));

  function buildRequest(): Omit<CreateAuditRequest, "employmentId" | "payslipId"> {
    const publicHolidays: AuditPublicHoliday[] = [
      ...calendar
        .filter(isOn)
        .map((h) => ({ date: h.date, name: h.name, ...(h.from === undefined ? {} : { from: h.from }) })),
      ...extraHolidays
        .filter((h) => h.date !== "")
        .map((h) => ({
          date: h.date,
          ...(h.from === "" ? {} : { from: h.from }),
          ...(h.name.trim() === "" ? {} : { name: h.name.trim() }),
        })),
    ];
    const guaranteedHoursVariations = variations
      .map((v) => ({ date: v.date, minutes: minutesOf(v.hours) }))
      .filter((v): v is { date: string; minutes: number } => v.date !== "" && v.minutes !== null);
    const leaveEntries = leave
      .map((l) => ({ kind: l.kind, minutes: minutesOf(l.hours) }))
      .filter((l): l is LeaveEntry => l.minutes !== null && l.minutes > 0);
    const cold = minutesOf(coldWork);
    const below = minutesOf(belowZero);
    const meals = mealDates.filter((d) => d !== "");
    const claims = {
      ...(cold === null || cold === 0 ? {} : { coldWorkMinutes: cold }),
      ...(below === null || below === 0 ? {} : { belowZeroMinutes: below }),
      ...(/^\d{1,5}(\.\d)?$/.test(kilometres) && Number(kilometres) > 0
        ? { vehicleKilometres: kilometres }
        : {}),
      ...(meals.length === 0 ? {} : { mealAllowanceDates: meals }),
    };
    return {
      // Sent whenever the calendar has loaded, so the audit records exactly which days counted.
      ...(holidays.data === undefined && extraHolidays.length === 0 ? {} : { publicHolidays }),
      ...(guaranteedHoursVariations.length === 0 ? {} : { guaranteedHoursVariations }),
      ...(leaveEntries.length === 0 ? {} : { leave: leaveEntries }),
      ...(Object.keys(claims).length === 0 ? {} : { allowanceClaims: claims }),
    };
  }

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedEmploymentId === "" || payslip === undefined) {
      return;
    }
    try {
      const audit = await createAudit.mutateAsync({
        body: { employmentId: selectedEmploymentId, payslipId: payslip.id, ...buildRequest() },
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
          icon={FileSearch}
          title="Add an employment first"
          description="An audit compares a payslip with the shifts recorded for one employment."
          action={
            <Button asChild>
              <Link href="/employments/new">Add employment</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Audits", href: "/audits" }]}
        title="Run an audit"
        description="WageGuard prices every shift you recorded that starts within the payslip's pay period, then compares the total with what you were paid."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardContent>
            <form className="grid" onSubmit={(e) => void onSubmit(e)}>
              <FormSection title="What to check" description="One payslip for one job." columns={1}>
                <div className="grid gap-1.5">
                  <Label htmlFor="audit-employment">Employment</Label>
                  <NativeSelect
                    id="audit-employment"
                    value={selectedEmploymentId}
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
                        className="text-primary font-medium hover:underline"
                        href={`/payslips/new?employmentId=${selectedEmploymentId}`}
                      >
                        Enter one
                      </Link>
                      .
                    </p>
                  ) : (
                    <NativeSelect
                      id="audit-payslip"
                      value={payslip?.id}
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
              </FormSection>

              <FormSection
                title="Public holidays"
                description={
                  employment?.state === null
                    ? "Add your state to the employment to load its public holidays, or list them here."
                    : `The ${stateLabel(employment?.state ?? null)} holidays in this pay period, from the Fair Work Ombudsman's list. Untick any that didn't apply where you work, and add local ones.`
                }
                columns={1}
              >
                {holidays.isPending && holidays.fetchStatus !== "idle" ? (
                  <LoadingState rows={1} label="Loading public holidays" />
                ) : holidays.isError ? (
                  <ErrorState error={holidays.error} onRetry={() => void holidays.refetch()} />
                ) : (
                  <>
                    {uncovered ? (
                      <p className="border-warning/30 bg-warning-soft text-warning rounded-lg border p-3 text-sm">
                        The holiday list doesn&rsquo;t cover every year in this pay period yet. Add any public
                        holidays yourself.
                      </p>
                    ) : null}
                    {calendar.length === 0 && holidays.data !== undefined ? (
                      <p className="text-muted-foreground text-sm">
                        No public holidays fall in this pay period.
                      </p>
                    ) : null}
                    {calendar.length > 0 ? (
                      <ul className="divide-border/70 divide-y rounded-lg border">
                        {calendar.map((h) => (
                          <li key={`${h.date}-${h.name}`} className="flex items-start gap-3 px-4 py-3">
                            <input
                              id={`holiday-${h.date}-${h.name}`}
                              type="checkbox"
                              className="accent-primary mt-0.5 size-4"
                              checked={isOn(h)}
                              onChange={(e) => {
                                if (h.scope === "STATEWIDE") {
                                  setUnticked({ ...unticked, [h.date]: !e.target.checked });
                                } else {
                                  setTicked({ ...ticked, [h.date]: e.target.checked });
                                }
                              }}
                            />
                            <label htmlFor={`holiday-${h.date}-${h.name}`} className="flex-1 text-sm">
                              <span className="font-medium">{h.name}</span>
                              <span className="text-muted-foreground block text-xs">
                                {formatDate(h.date)}
                                {h.from === undefined ? "" : ` · from ${h.from}`}
                                {h.scope === "REGIONAL" ? " · only in some areas" : ""}
                              </span>
                            </label>
                            <CalendarDays className="text-muted-foreground size-4" aria-hidden />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
                {extraHolidays.map((h, index) => (
                  <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_7rem_1.4fr_auto]">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`extra-holiday-${index}`}>Local holiday {index + 1}</Label>
                      <Input
                        id={`extra-holiday-${index}`}
                        type="date"
                        value={h.date}
                        onChange={(e) => {
                          setExtraHolidays(
                            extraHolidays.map((x, i) => (i === index ? { ...x, date: e.target.value } : x)),
                          );
                        }}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`extra-holiday-from-${index}`}>From (optional)</Label>
                      <Input
                        id={`extra-holiday-from-${index}`}
                        type="time"
                        value={h.from}
                        onChange={(e) => {
                          setExtraHolidays(
                            extraHolidays.map((x, i) => (i === index ? { ...x, from: e.target.value } : x)),
                          );
                        }}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`extra-holiday-name-${index}`}>Name (optional)</Label>
                      <Input
                        id={`extra-holiday-name-${index}`}
                        value={h.name}
                        placeholder="For example, Show Day"
                        onChange={(e) => {
                          setExtraHolidays(
                            extraHolidays.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)),
                          );
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setExtraHolidays(extraHolidays.filter((_, i) => i !== index));
                      }}
                      aria-label={`Remove local holiday ${index + 1}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setExtraHolidays([...extraHolidays, { date: "", from: "", name: "" }]);
                    }}
                  >
                    <Plus aria-hidden />
                    Add a local public holiday
                  </Button>
                </div>
              </FormSection>

              <details className="group border-t py-7">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="block text-sm font-semibold tracking-tight">
                      Extras for this pay period
                    </span>
                    <span className="text-muted-foreground mt-1 block text-sm">
                      Leave taken, allowance claims and written changes to part-time hours. Optional.
                    </span>
                  </span>
                  <ChevronDown
                    className="text-muted-foreground mt-0.5 size-4 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="mt-6 grid gap-8">
                  {employment?.employmentType === "PART_TIME" ? (
                    <ListEditor
                      title="Guaranteed hours varied in writing (cl. 10.6)"
                      hint="Days your guaranteed hours were changed by written agreement. Hours up to the new figure are ordinary time."
                      addLabel="Add a varied day"
                      rows={variations}
                      onChange={setVariations}
                      blank={{ date: "", hours: "" }}
                      render={(v, i, update) => (
                        <>
                          <Field label={`Date ${i + 1}`} id={`variation-date-${i}`}>
                            <Input
                              id={`variation-date-${i}`}
                              type="date"
                              value={v.date}
                              onChange={(e) => {
                                update({ ...v, date: e.target.value });
                              }}
                            />
                          </Field>
                          <Field label="Agreed hours" id={`variation-hours-${i}`}>
                            <Input
                              id={`variation-hours-${i}`}
                              inputMode="numeric"
                              placeholder="7:30"
                              value={v.hours}
                              onChange={(e) => {
                                update({ ...v, hours: e.target.value });
                              }}
                            />
                          </Field>
                        </>
                      )}
                    />
                  ) : null}

                  <div className="grid gap-4">
                    <div>
                      <p className="text-sm font-medium">Allowance claims (cl. 19)</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Allowances ticked on the employment (laundry, first aid and so on) are added
                        automatically.
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field
                        label="Cold work hours"
                        id="cold-work"
                        hint="Cold chambers or freezers (cl. 19.9)."
                      >
                        <Input
                          id="cold-work"
                          inputMode="numeric"
                          placeholder="0:00"
                          value={coldWork}
                          onChange={(e) => {
                            setColdWork(e.target.value);
                          }}
                        />
                      </Field>
                      <Field label="Of which below 0°C" id="below-zero">
                        <Input
                          id="below-zero"
                          inputMode="numeric"
                          placeholder="0:00"
                          value={belowZero}
                          onChange={(e) => {
                            setBelowZero(e.target.value);
                          }}
                        />
                      </Field>
                      <Field
                        label="Kilometres in your own car"
                        id="kilometres"
                        hint="When asked to use it (cl. 19.7)."
                      >
                        <Input
                          id="kilometres"
                          inputMode="decimal"
                          placeholder="0"
                          value={kilometres}
                          onChange={(e) => {
                            setKilometres(e.target.value);
                          }}
                        />
                      </Field>
                    </div>
                    <ListEditor
                      title="Meal allowance days (cl. 19.2)"
                      hint="Days you worked over an hour of overtime without 24 hours' notice and weren't given a meal."
                      addLabel="Add a day"
                      rows={mealDates}
                      onChange={setMealDates}
                      blank=""
                      render={(d, i, update) => (
                        <Field label={`Day ${i + 1}`} id={`meal-${i}`}>
                          <Input
                            id={`meal-${i}`}
                            type="date"
                            value={d}
                            onChange={(e) => {
                              update(e.target.value);
                            }}
                          />
                        </Field>
                      )}
                    />
                  </div>

                  <ListEditor
                    title="Leave in this pay period"
                    hint="Paid at the base rate, with 17.5% loading on annual leave (cl. 28.3). Casuals don't get paid leave."
                    addLabel="Add leave"
                    rows={leave}
                    onChange={setLeave}
                    blank={{ kind: "ANNUAL", hours: "" }}
                    render={(l, i, update) => (
                      <>
                        <Field label={`Leave ${i + 1}`} id={`leave-kind-${i}`}>
                          <NativeSelect
                            id={`leave-kind-${i}`}
                            value={l.kind}
                            onChange={(e) => {
                              update({ ...l, kind: e.target.value as LeaveEntry["kind"] });
                            }}
                          >
                            {LEAVE_KINDS.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.label}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field label="Hours" id={`leave-hours-${i}`}>
                          <Input
                            id={`leave-hours-${i}`}
                            inputMode="numeric"
                            placeholder="7:36"
                            value={l.hours}
                            onChange={(e) => {
                              update({ ...l, hours: e.target.value });
                            }}
                          />
                        </Field>
                      </>
                    )}
                  />
                </div>
              </details>

              <div className="flex flex-wrap items-center gap-3 border-t pt-6">
                <Button type="submit" size="lg" disabled={payslip === undefined || createAudit.isPending}>
                  {createAudit.isPending ? "Running audit…" : "Run audit"}
                </Button>
                <p className="text-muted-foreground text-xs">
                  Takes a second. The result is saved and can&rsquo;t be changed later.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Before you run it</h2>
              </CardTitle>
              <CardDescription>
                Make sure every shift in the pay period has been recorded, with its meal breaks. Shifts from
                the 13 days before also count towards weekly hours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground grid gap-3 text-sm">
                <li className="flex gap-2">
                  <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                  Every rate, clause and assumption is saved with the result.
                </li>
                <li className="flex gap-2">
                  <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                  Running it twice by accident still makes one audit.
                </li>
              </ul>
            </CardContent>
          </Card>
          <VerificationNotice />
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint === undefined ? null : <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

/** A small repeating list: one row of inputs per entry, with add and remove. */
function ListEditor<T>({
  title,
  hint,
  addLabel,
  rows,
  onChange,
  blank,
  render,
}: {
  title: string;
  hint: string;
  addLabel: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: T;
  render: (row: T, index: number, update: (row: T) => void) => ReactNode;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
      </div>
      {rows.map((row, index) => (
        <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
          {render(row, index, (next) => {
            onChange(rows.map((r, i) => (i === index ? next : r)));
          })}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="sm:col-start-3"
            onClick={() => {
              onChange(rows.filter((_, i) => i !== index));
            }}
            aria-label={`Remove ${title.toLowerCase()} ${index + 1}`}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onChange([...rows, blank]);
          }}
        >
          <Plus aria-hidden />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
