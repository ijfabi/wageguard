import type { Tone } from "@wageguard/presentation";

export * from "@wageguard/presentation";

/** Tailwind classes for a tone (badges, callouts). Colours meet WCAG AA against their background. */
export const TONE_CLASSES: Readonly<Record<Tone, string>> = {
  info: "bg-info-soft text-info border-info/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  neutral: "bg-neutral-soft text-neutral border-neutral/30",
};
