import { CalendarClock, FileSearch, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: CalendarClock,
    title: "Record your hours",
    body: "Enter shifts and breaks, or import a timesheet CSV. Times are handled in your local time zone, including daylight saving changes.",
  },
  {
    icon: FileSearch,
    title: "Enter your payslip",
    body: "Add the gross pay from your payslip, optionally itemised into hours worked, allowances and leave.",
  },
  {
    icon: Scale,
    title: "Compare and understand",
    body: "WageGuard calculates the award minimum for each supported hour, compares it with your payslip and shows every rule, rate and clause it used.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="text-primary size-5" aria-hidden />
            WageGuard
          </span>
          <nav aria-label="Account" className="flex gap-2">
            <Button asChild variant="ghost">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-up">Create account</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="text-primary text-sm font-medium">Independent payroll verification</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Understand your pay. Verify every dollar.
          </h1>
          <p className="text-muted-foreground mt-5 max-w-2xl text-lg">
            WageGuard checks your gross pay against the General Retail Industry Award 2020 using
            deterministic, versioned rules taken from the official award text, and explains exactly how each
            amount was worked out.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">Check a payslip</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#scope">What WageGuard supports</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="how" className="bg-secondary/50 border-y">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 id="how" className="text-2xl font-semibold">
              How it works
            </h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="bg-card rounded-lg border p-6">
                  <step.icon className="text-primary size-6" aria-hidden />
                  <h3 className="mt-4 font-semibold">
                    {index + 1}. {step.title}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-sm">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="scope" aria-labelledby="scope-heading" className="mx-auto max-w-6xl px-4 py-14">
          <h2 id="scope-heading" className="text-2xl font-semibold">
            What is supported today
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border p-6">
              <h3 className="font-semibold">Calculated</h3>
              <ul className="text-muted-foreground mt-3 list-disc space-y-1.5 pl-5 text-sm">
                <li>General Retail Industry Award 2020 (MA000004), Retail Employee Level 1</li>
                <li>Adult casual and part-time employees who are not shiftworkers</li>
                <li>Ordinary hours, weekday evening, Saturday and Sunday penalty rates</li>
                <li>Pay periods starting on or after 1 July 2026</li>
              </ul>
            </div>
            <div className="rounded-lg border p-6">
              <h3 className="font-semibold">Flagged for review, never guessed</h3>
              <ul className="text-muted-foreground mt-3 list-disc space-y-1.5 pl-5 text-sm">
                <li>Overtime, public holidays and minimum-engagement top-ups</li>
                <li>Work outside the span of ordinary hours</li>
                <li>Full-time, junior and shiftwork employment, and enterprise agreements</li>
                <li>Allowances and leave</li>
              </ul>
            </div>
          </div>
          <p className="text-muted-foreground mt-8 max-w-3xl text-sm">
            WageGuard is an informational tool, not legal advice. Its rates have been transcribed from the
            official award and checked by automated tests, but have not been reviewed by a payroll or legal
            professional. For an authoritative answer, use the{" "}
            <a
              className="text-primary underline"
              href="https://calculate.fairwork.gov.au/"
              rel="noopener noreferrer"
            >
              Fair Work Pay Calculator
            </a>{" "}
            or contact the Fair Work Ombudsman.
          </p>
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto max-w-6xl px-4 py-6 text-xs">
          WageGuard · Demonstration project using synthetic data only. Do not enter real personal or employer
          information.
        </div>
      </footer>
    </div>
  );
}
