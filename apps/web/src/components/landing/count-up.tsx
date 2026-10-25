"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Counts up to a number when it first scrolls into view. The final value is rendered on the server
 * and for screen readers, so the animation only ever affects what is drawn, never what is read.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  durationMs = 1600,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const format = (n: number) =>
    `${prefix}${n.toLocaleString("en-AU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;

  useEffect(() => {
    const element = ref.current;
    if (element === null || reduced) {
      return;
    }
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting !== true) {
        return;
      }
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / durationMs);
        const eased = 1 - (1 - progress) ** 3;
        setShown(value * eased);
        if (progress < 1) {
          frame = requestAnimationFrame(tick);
        }
      };
      setShown(0);
      frame = requestAnimationFrame(tick);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs, reduced]);

  return (
    <span ref={ref}>
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
