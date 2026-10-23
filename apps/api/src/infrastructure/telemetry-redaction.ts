import type { Span, SpanProcessor } from "@opentelemetry/sdk-trace";

export const REDACTED = "[REDACTED]";

/** Personal or fingerprinting data the logs already omit; traces must not collect it either. */
const REDACTED_KEYS = ["client.address", "network.peer.address", "network.peer.port", "user_agent.original"];

/**
 * Rewrites span attributes just before a span ends, so it applies to every instrumentation:
 * client addresses and user agents are redacted, and query strings are removed from URLs
 * (matching the request logs). Register it before the exporting processor.
 */
export class RedactingSpanProcessor implements SpanProcessor {
  onEnding(span: Span): void {
    const attributes = span.attributes;
    for (const key of REDACTED_KEYS) {
      if (attributes[key] !== undefined) {
        span.setAttribute(key, REDACTED);
      }
    }
    if (attributes["url.query"] !== undefined) {
      span.setAttribute("url.query", REDACTED);
    }
    const full = attributes["url.full"];
    if (typeof full === "string" && full.includes("?")) {
      span.setAttribute("url.full", full.slice(0, full.indexOf("?")));
    }
  }

  // Nothing to do at start or after the span has ended.
  onStart(): void {}
  onEnd(): void {}
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
