"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

/** Timeline from 6 am to 10 pm, in minutes from 6 am. */
const DAY_START = 6 * 60;
const DAY_SPAN = 16 * 60;
const pct = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return ((h * 60 + m - DAY_START) / DAY_SPAN) * 100;
};

/** Golden scenario G009: the same shifts, rates and totals the engine produces. */
const SHIFTS = [
  {
    day: "Mon 6 Jul",
    tone: "bg-indigo-400",
    parts: [
      ["09:00", "12:00"],
      ["12:30", "17:00"],
    ],
  },
  {
    day: "Sat 11 Jul",
    tone: "bg-cyan-400",
    parts: [
      ["08:00", "12:00"],
      ["12:30", "16:30"],
    ],
  },
  {
    day: "Sun 12 Jul",
    tone: "bg-fuchsia-400",
    parts: [
      ["10:00", "13:00"],
      ["13:30", "16:00"],
    ],
  },
] as const;

const LINES = [
  { label: "Weekday ordinary · 7.5 h × $34.76", amount: "$260.70", tone: "bg-indigo-400" },
  { label: "Saturday · 8 h × $41.72", amount: "$333.76", tone: "bg-cyan-400" },
  { label: "Sunday · 5.5 h × $48.67", amount: "$267.69", tone: "bg-fuchsia-400" },
] as const;

/** Stage timings in milliseconds; the last stage holds before the loop restarts. */
const STAGES = [600, 900, 900, 900, 700, 700, 700, 900, 1000, 3200];
const FINAL = STAGES.length - 1;

/**
 * A decorative replay of a real audit. The animated card is hidden from screen readers, which get a
 * single plain-text summary instead. It loops with a pause button (WCAG 2.2.2) and stays on the
 * final frame when motion is reduced.
 */
export function LiveAuditDemo() {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [stage, setStage] = useState(FINAL);

  useEffect(() => {
    if (reduced || paused) {
      return;
    }
    const timer = setTimeout(() => {
      setStage((s) => (s >= FINAL ? 0 : s + 1));
    }, STAGES[stage] ?? 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [stage, paused, reduced]);

  const shown = reduced ? FINAL : stage;
  const shiftsVisible = Math.min(3, Math.max(0, shown - 0));
  const linesVisible = Math.min(3, Math.max(0, shown - 3));
  const totalVisible = shown >= 7;
  const verdictVisible = shown >= 8;

  return (
    <div className="relative">
      <p className="sr-only">
        Example audit: three casual shifts in July 2026, on a Monday, Saturday and Sunday, add up to an award
        minimum of $862.15. The payslip shows $800.00, so WageGuard reports a potential underpayment of
        $62.15.
      </p>
      <div
        aria-hidden
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-100 shadow-2xl shadow-indigo-950/60 backdrop-blur sm:p-8"
      >
        <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="flex items-center justify-between text-xs tracking-widest text-indigo-200 uppercase">
          <span>Audit · Mon 6 – Sun 19 Jul 2026</span>
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px]">
            Casual · Level 1
          </span>
        </div>

        <div className="mt-6 grid gap-3">
          {SHIFTS.map((shift, i) => (
            <div key={shift.day} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-sm">
              <span
                className={cn(
                  "transition-opacity duration-500",
                  i < shiftsVisible ? "opacity-100" : "opacity-20",
                )}
              >
                {shift.day}
              </span>
              <div className="relative h-3 rounded-full bg-white/8">
                {shift.parts.map(([from, to]) => (
                  <div
                    key={from}
                    className={cn(
                      "absolute inset-y-0 origin-left rounded-full transition-transform duration-700 ease-out",
                      shift.tone,
                      i < shiftsVisible ? "scale-x-100" : "scale-x-0",
                    )}
                    style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[5.5rem_1fr] text-[10px] text-slate-400">
            <span />
            <div className="flex justify-between">
              <span>6 am</span>
              <span>noon</span>
              <span>6 pm</span>
              <span>10 pm</span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-2 border-t border-white/10 pt-5">
          {LINES.map((line, i) => (
            <div
              key={line.label}
              className={cn(
                "flex items-center justify-between gap-4 text-sm transition-all duration-500",
                i < linesVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
              )}
            >
              <span className="flex items-center gap-2 text-slate-300">
                <span className={cn("size-2 rounded-full", line.tone)} />
                {line.label}
              </span>
              <span className="font-medium tabular-nums">{line.amount}</span>
            </div>
          ))}
          <div
            className={cn(
              "mt-2 flex items-center justify-between border-t border-dashed border-white/15 pt-3 transition-opacity duration-500",
              totalVisible ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="text-sm text-slate-300">Award minimum</span>
            <span className="text-2xl font-semibold tabular-nums">$862.15</span>
          </div>
        </div>

        <div
          className={cn(
            "mt-5 rounded-2xl border p-4 transition-all duration-700",
            verdictVisible
              ? "translate-y-0 border-rose-300/40 bg-rose-500/15 opacity-100"
              : "translate-y-3 border-transparent opacity-0",
          )}
        >
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-semibold text-rose-100">Potential underpayment</span>
            <span className="text-xl font-semibold text-rose-100 tabular-nums">−$62.15</span>
          </div>
          <p className="mt-1 text-xs text-rose-100/80">
            Payslip: $800.00. Every figure above links back to an award clause.
          </p>
        </div>
      </div>

      {reduced ? null : (
        <button
          type="button"
          onClick={() => {
            setPaused((p) => !p);
          }}
          className="absolute right-4 bottom-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-100 backdrop-blur hover:bg-slate-800"
          aria-pressed={paused}
        >
          {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
          {paused ? "Play animation" : "Pause animation"}
        </button>
      )}
    </div>
  );
}
