"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Fades its content up as it scrolls into view. The server renders it fully visible, and it is only
 * hidden after hydration if it is still below the fold, so nothing is ever lost without JavaScript
 * or with reduced motion.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Render as a list item when it sits directly inside a list. */
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLDivElement & HTMLLIElement>(null);
  const reduced = useReducedMotion();
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");

  useEffect(() => {
    const element = ref.current;
    if (element === null || reduced) {
      return;
    }
    if (element.getBoundingClientRect().top < window.innerHeight * 0.9) {
      return; // already on screen: leave it as rendered
    }
    setState("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting === true) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [reduced]);

  return (
    <Tag
      ref={ref}
      className={className}
      data-reveal={state === "static" ? undefined : state}
      style={state === "shown" && delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
