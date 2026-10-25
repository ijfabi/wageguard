import {
  ArrowRight,
  CalendarClock,
  Eye,
  FileSearch,
  Fingerprint,
  Lock,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { AccessibilityMenu } from "@/components/accessibility-menu";
import { CountUp } from "@/components/landing/count-up";
import { LiveAuditDemo } from "@/components/landing/live-audit-demo";
import { OrbitGraphic } from "@/components/landing/orbit-graphic";
import { QuoteMarquee } from "@/components/landing/quote-marquee";
import { Reveal } from "@/components/landing/reveal";
import { Button } from "@/components/ui/button";
import { homepageQuotes } from "@/lib/award-quotes";

const REPO = "https://github.com/ijfabi/wageguard";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "2026-07-01" -> "1 July 2026" (no weekday: it reads oddly for a document date). */
const longDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1] ?? ""} ${year}`;
};

const STEPS = [
  {
    icon: CalendarClock,
    title: "Record your hours",
    body: "Type in your shifts or import a timesheet. Times stay exactly as you worked them, daylight saving and all.",
  },
  {
    icon: FileSearch,
    title: "Add your payslip",
    body: "Copy in the gross pay, or itemise it into hours, allowances and leave for a sharper comparison.",
  },
  {
    icon: Scale,
    title: "See every dollar",
    body: "WageGuard prices each minute under the award, compares the total with your payslip and shows the clause behind every number.",
  },
] as const;

const PRINCIPLES = [
  {
    icon: Eye,
    title: "Shows its working",
    body: "Every segment of every shift names its rule, its rate and the award clause it comes from. Nothing is a black box.",
  },
  {
    icon: ShieldCheck,
    title: "Never guesses",
    body: "Overtime, public holidays and anything else it can't verify are flagged for review, not quietly priced.",
  },
  {
    icon: Fingerprint,
    title: "Keeps its promises",
    body: "Rule sets are fingerprinted and audits are frozen once saved, so a result can always be reproduced exactly.",
  },
  {
    icon: Lock,
    title: "Private by design",
    body: "No pay data in logs or telemetry, sessions you can revoke, and one button to delete everything.",
  },
] as const;

/** Measured results (docs/performance.md). Each one is a saved benchmark record, not a target. */
const EVIDENCE = [
  {
    value: 32588,
    label: "synthetic shifts calculated per second",
    note: "Engine benchmark, median of 10 runs",
  },
  {
    value: 21,
    suffix: "/21",
    label: "golden payroll scenarios passing",
    note: "10 calculations, 11 correct refusals",
  },
  { value: 350, label: "automated tests", note: "Plus 14 end-to-end browser tests" },
  { value: 0, label: "duplicate or lost audits", note: "With the API killed mid-load and the database down" },
] as const;

export default function HomePage() {
  const { quotes, awardTitle, consolidatedTo } = homepageQuotes();

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="focus:bg-background sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to main content
      </a>

      {/* Hero: always dark, like the night sky it borrows from. */}
      <div className="relative isolate overflow-hidden bg-[#050816] text-white">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div
            className="absolute -top-1/3 left-[-10%] h-[70%] w-[70%] rounded-full bg-indigo-600/30 blur-[120px]"
            style={{ animation: "wg-aurora 18s ease-in-out infinite" }}
          />
          <div
            className="absolute top-1/4 right-[-15%] h-[60%] w-[55%] rounded-full bg-cyan-500/20 blur-[120px]"
            style={{ animation: "wg-aurora 22s ease-in-out -6s infinite" }}
          />
          <div
            className="absolute bottom-[-30%] left-1/4 h-[60%] w-[60%] rounded-full bg-fuchsia-600/20 blur-[130px]"
            style={{ animation: "wg-aurora 26s ease-in-out -12s infinite" }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        </div>

        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050816]/60 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-400 to-cyan-300 text-slate-950">
                <ShieldCheck className="size-4.5" aria-hidden />
              </span>
              WageGuard
            </Link>
            <nav
              aria-label="On this page"
              className="order-3 w-full text-sm text-slate-300 md:order-none md:w-auto"
            >
              <ul className="flex flex-wrap gap-x-5 gap-y-1">
                <li>
                  <a className="hover:text-white" href="#demo">
                    See it work
                  </a>
                </li>
                <li>
                  <a className="hover:text-white" href="#award">
                    The award
                  </a>
                </li>
                <li>
                  <a className="hover:text-white" href="#evidence">
                    Evidence
                  </a>
                </li>
                <li>
                  <a className="hover:text-white" href="#scope">
                    What it covers
                  </a>
                </li>
              </ul>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <AccessibilityMenu className="text-slate-200 hover:bg-white/10 hover:text-white" />
              <Button asChild variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild className="bg-white text-slate-950 hover:bg-indigo-100">
                <Link href="/sign-up">Get started</Link>
              </Button>
            </div>
          </div>
        </header>

        <main id="main">
          <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-16 pb-24 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24 lg:pb-32">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs tracking-wide text-indigo-100">
                <Sparkles className="size-3.5" aria-hidden />
                Australian retail pay, checked line by line
              </p>
              <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                Every hour has a price. <span className="wg-gradient-text">Make sure you were paid it.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
                WageGuard reads your shifts the way the General Retail Industry Award does, minute by minute,
                then puts your payslip next to the result and shows you exactly where every dollar comes from.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="h-12 bg-white px-6 text-base text-slate-950 hover:bg-indigo-100"
                >
                  <Link href="/sign-up">
                    Check a payslip
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 border-white/25 bg-white/5 px-6 text-base text-white hover:bg-white/10 hover:text-white"
                >
                  <a href="#demo">Watch an audit run</a>
                </Button>
              </div>
              <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6 text-sm">
                <div>
                  <dt className="text-slate-400">Rates from</dt>
                  <dd className="mt-1 font-medium text-white">The official award</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Every result</dt>
                  <dd className="mt-1 font-medium text-white">Fully explained</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Your data</dt>
                  <dd className="mt-1 font-medium text-white">Yours to delete</dd>
                </div>
              </dl>
            </div>
            <div style={{ animation: "wg-float 9s ease-in-out infinite" }}>
              <OrbitGraphic />
            </div>
          </section>

          <section id="demo" aria-labelledby="demo-heading" className="relative border-t border-white/10">
            <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 lg:grid-cols-2">
              <Reveal>
                <p className="text-sm font-medium tracking-widest text-cyan-200 uppercase">See it work</p>
                <h2 id="demo-heading" className="mt-3 text-4xl font-semibold tracking-tight">
                  A fortnight of shifts, audited in seconds.
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-slate-300">
                  A casual works a Monday, a Saturday and a Sunday. The award says that&rsquo;s worth $862.15.
                  The payslip says $800.00. WageGuard splits every shift at the moments its rate changes,
                  prices each piece, and shows the gap with the clauses to back it up.
                </p>
                <ul className="mt-6 grid gap-3 text-slate-200">
                  <li className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan-300" aria-hidden />
                    Weekday, Saturday and Sunday rates applied minute by minute
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan-300" aria-hidden />
                    Unpaid meal breaks taken out, exactly as recorded
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan-300" aria-hidden />
                    The same numbers a person gets by working it out from the award by hand
                  </li>
                </ul>
              </Reveal>
              <Reveal delay={120}>
                <LiveAuditDemo />
              </Reveal>
            </div>
          </section>
        </main>
      </div>

      {/* Below the hero the page follows the chosen theme. */}
      <section id="award" aria-labelledby="award-heading" className="py-24">
        <div className="mx-auto max-w-7xl px-4">
          <Reveal className="max-w-3xl">
            <p className="text-primary text-sm font-medium tracking-widest uppercase">
              In the award&rsquo;s own words
            </p>
            <h2 id="award-heading" className="mt-3 text-4xl font-semibold tracking-tight">
              Your rights are written down. WageGuard reads them for you.
            </h2>
            <p className="text-muted-foreground mt-4 text-lg">
              Quoted word for word from the {awardTitle}, consolidated to {longDate(consolidatedTo)}. These
              are the same passages the calculation is built on.
            </p>
          </Reveal>
        </div>
        <div className="mx-auto mt-12 max-w-[100rem] px-4">
          <QuoteMarquee quotes={quotes} awardTitle="General Retail Industry Award 2020" />
        </div>
      </section>

      <section aria-labelledby="how-heading" className="bg-secondary/40 border-y py-24">
        <div className="mx-auto max-w-7xl px-4">
          <Reveal>
            <h2 id="how-heading" className="text-4xl font-semibold tracking-tight">
              Three steps. No spreadsheets.
            </h2>
          </Reveal>
          <div className="relative mt-14">
            <div
              className="from-primary/0 via-primary/40 to-primary/0 absolute top-8 right-[16%] left-[16%] hidden h-px bg-gradient-to-r md:block"
              aria-hidden
            />
            <ol className="relative grid gap-8 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <Reveal
                  as="li"
                  key={step.title}
                  delay={index * 120}
                  className="bg-card relative rounded-2xl border p-7 shadow-sm transition-transform hover:-translate-y-1"
                >
                  <span className="bg-primary text-primary-foreground grid size-14 place-items-center rounded-2xl shadow-lg">
                    <step.icon className="size-6" aria-hidden />
                  </span>
                  <p className="text-muted-foreground mt-5 text-xs font-semibold tracking-widest uppercase">
                    Step {index + 1}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground mt-3 leading-relaxed">{step.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="evidence" aria-labelledby="evidence-heading" className="py-24">
        <div className="mx-auto max-w-7xl px-4">
          <Reveal className="max-w-3xl">
            <p className="text-primary text-sm font-medium tracking-widest uppercase">
              Evidence, not adjectives
            </p>
            <h2 id="evidence-heading" className="mt-3 text-4xl font-semibold tracking-tight">
              Measured, saved and published.
            </h2>
            <p className="text-muted-foreground mt-4 text-lg">
              Every number below comes from a saved test or benchmark run on synthetic data, on one laptop.
              The method and the raw records are{" "}
              <a
                className="text-primary underline underline-offset-4"
                href={`${REPO}/blob/main/docs/performance.md`}
              >
                published with the code
              </a>
              .
            </p>
          </Reveal>
          <dl className="mt-12 grid gap-px overflow-hidden rounded-3xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {EVIDENCE.map((item, index) => (
              <Reveal key={item.label} delay={index * 100} className="bg-card flex flex-col p-8">
                {/* Label first in the markup (a valid definition list); the number is shown first. */}
                <dt className="mt-3 font-medium">{item.label}</dt>
                <dd className="order-first text-5xl font-semibold tracking-tight tabular-nums">
                  <CountUp value={item.value} suffix={"suffix" in item ? item.suffix : ""} />
                </dd>
                <dd className="text-muted-foreground mt-1 text-sm">{item.note}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="principles-heading" className="bg-secondary/40 border-y py-24">
        <div className="mx-auto max-w-7xl px-4">
          <Reveal>
            <h2 id="principles-heading" className="text-4xl font-semibold tracking-tight">
              Built to be trusted, not just believed.
            </h2>
          </Reveal>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map((item, index) => (
              <Reveal
                as="li"
                key={item.title}
                delay={index * 100}
                className="bg-card h-full rounded-2xl border p-7"
              >
                <item.icon className="text-primary size-7" aria-hidden />
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="text-muted-foreground mt-2 leading-relaxed">{item.body}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section id="scope" aria-labelledby="scope-heading" className="py-24">
        <div className="mx-auto max-w-7xl px-4">
          <Reveal className="max-w-3xl">
            <h2 id="scope-heading" className="text-4xl font-semibold tracking-tight">
              What it covers, and what it won&rsquo;t pretend to.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-2xl border p-7">
                <h3 className="text-lg font-semibold">Calculated</h3>
                <ul className="text-muted-foreground mt-4 list-disc space-y-2 pl-5">
                  <li>General Retail Industry Award 2020 (MA000004), Retail Employee Level 1</li>
                  <li>Adult casual and part-time employees who aren&rsquo;t shiftworkers</li>
                  <li>Ordinary hours, weekday evening, Saturday and Sunday penalty rates</li>
                  <li>Pay periods starting on or after 1 July 2026</li>
                </ul>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="border-warning/40 bg-warning-soft/40 h-full rounded-2xl border p-7">
                <h3 className="text-lg font-semibold">Flagged for review, never guessed</h3>
                <ul className="text-muted-foreground mt-4 list-disc space-y-2 pl-5">
                  <li>Overtime, public holidays and minimum-engagement top-ups</li>
                  <li>Work outside the span of ordinary hours</li>
                  <li>Full-time, junior and shiftwork employment, and enterprise agreements</li>
                  <li>Allowances and leave</li>
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section aria-labelledby="cta-heading" className="px-4 pb-24">
        <Reveal>
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-[#050816] p-[1px]">
            <div
              className="absolute inset-0 bg-[linear-gradient(110deg,#6366f1,#22d3ee,#e879f9,#6366f1)] bg-[length:200%_auto] opacity-70"
              style={{ animation: "wg-shimmer 6s linear infinite" }}
              aria-hidden
            />
            <div className="relative rounded-[calc(2rem-1px)] bg-[#050816] px-8 py-16 text-center text-white sm:px-16">
              <h2 id="cta-heading" className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Your payslip has a story.
                <br />
                <span className="wg-gradient-text">Read the whole of it.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg text-slate-300">
                It takes about five minutes with a timesheet in hand. Use made-up details if you&rsquo;re just
                exploring. This is a demonstration service.
              </p>
              <Button
                asChild
                size="lg"
                className="mt-9 h-12 bg-white px-7 text-base text-slate-950 hover:bg-indigo-100"
              >
                <Link href="/sign-up">
                  Start your first audit
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm md:grid-cols-[2fr_1fr]">
          <p className="max-w-2xl leading-relaxed">
            WageGuard is an informational tool, not legal advice. Its rates were copied from the official
            award and checked by automated tests, but haven&rsquo;t been reviewed by a payroll or legal
            professional. For an authoritative answer, use the{" "}
            <a
              className="text-primary underline"
              href="https://calculate.fairwork.gov.au/"
              rel="noopener noreferrer"
            >
              Fair Work Pay Calculator
            </a>{" "}
            or contact the Fair Work Ombudsman. Demonstration project: please don&rsquo;t enter real personal
            or employer details.
          </p>
          <ul className="grid content-start gap-2 md:justify-self-end">
            <li>
              <a
                className="hover:text-foreground underline-offset-4 hover:underline"
                href={`${REPO}/blob/main/ACCESSIBILITY.md`}
              >
                Accessibility statement
              </a>
            </li>
            <li>
              <a
                className="hover:text-foreground underline-offset-4 hover:underline"
                href={`${REPO}/blob/main/docs/known-limitations.md`}
              >
                Known limitations
              </a>
            </li>
            <li>
              <a className="hover:text-foreground underline-offset-4 hover:underline" href={REPO}>
                Source code
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
