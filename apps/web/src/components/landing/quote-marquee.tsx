"use client";

import { Pause, Play, Quote } from "lucide-react";
import { useState } from "react";

import type { AwardQuote } from "@/lib/award-quotes";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

function QuoteCard({ quote, awardTitle }: { quote: AwardQuote; awardTitle: string }) {
  return (
    <figure className="bg-card relative w-[min(26rem,82vw)] shrink-0 rounded-2xl border p-6 shadow-sm">
      <Quote className="text-primary/30 absolute top-5 right-5 size-8" aria-hidden />
      <blockquote className="pr-8 text-[0.97rem] leading-relaxed">&ldquo;{quote.text}&rdquo;</blockquote>
      <figcaption className="text-muted-foreground mt-4 text-xs">
        <span className="text-primary font-semibold">Clause {quote.clause}</span> · {awardTitle}
      </figcaption>
    </figure>
  );
}

/**
 * The award in its own words, scrolling slowly. It pauses on hover or keyboard focus and has a pause
 * button (WCAG 2.2.2). Screen readers get the list once; the copy that makes the loop seamless is
 * hidden from them. With reduced motion it is a plain grid.
 */
export function QuoteMarquee({ quotes, awardTitle }: { quotes: readonly AwardQuote[]; awardTitle: string }) {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);

  if (reduced) {
    return (
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {quotes.map((quote) => (
          <li key={quote.clause} className="[&>figure]:w-full">
            <QuoteCard quote={quote} awardTitle={awardTitle} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="relative">
      <div className="group overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
        <div
          className={cn(
            "flex w-max gap-5 py-2 group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]",
            paused && "[animation-play-state:paused]",
          )}
          style={{ animation: `wg-marquee ${quotes.length * 9}s linear infinite` }}
        >
          <ul className="flex gap-5">
            {quotes.map((quote) => (
              <li key={quote.clause}>
                <QuoteCard quote={quote} awardTitle={awardTitle} />
              </li>
            ))}
          </ul>
          <ul className="flex gap-5" aria-hidden>
            {quotes.map((quote) => (
              <li key={quote.clause}>
                <QuoteCard quote={quote} awardTitle={awardTitle} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => {
            setPaused((p) => !p);
          }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
        >
          {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
          {paused ? "Play quotes" : "Pause quotes"}
        </button>
      </div>
    </div>
  );
}
