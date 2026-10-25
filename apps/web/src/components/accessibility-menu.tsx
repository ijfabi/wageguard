"use client";

import { Accessibility } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CONTRASTS,
  DEFAULT_DISPLAY,
  MOTIONS,
  TEXT_SIZES,
  THEMES,
  type DisplayPreferences,
} from "@/lib/display-preferences";
import { setDisplayPreferences, useDisplayPreferences } from "@/lib/use-display-preferences";
import { cn } from "@/lib/utils";

const LABELS = {
  theme: { system: "Match my device", light: "Light", dark: "Dark" },
  textSize: { standard: "Standard", large: "Large", larger: "Larger" },
  motion: { system: "Match my device", reduce: "Reduce motion" },
  contrast: { standard: "Standard", high: "High contrast" },
} as const;

type Key = keyof DisplayPreferences;

/** A group of native radio buttons styled as a segmented control. */
function Choice<K extends Key>({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
}: {
  name: K;
  legend: string;
  hint: string;
  options: readonly DisplayPreferences[K][];
  value: DisplayPreferences[K];
  onChange: (value: DisplayPreferences[K]) => void;
}) {
  const id = useId();
  return (
    <fieldset className="grid gap-2" aria-describedby={`${id}-hint`}>
      <legend className="text-sm font-semibold">{legend}</legend>
      <p id={`${id}-hint`} className="text-muted-foreground -mt-1 text-xs">
        {hint}
      </p>
      <div className="bg-muted grid auto-cols-fr grid-flow-col gap-1 rounded-lg p-1">
        {options.map((option) => (
          <label
            key={option}
            className={cn(
              "has-[:focus-visible]:outline-ring cursor-pointer rounded-md px-2 py-1.5 text-center text-sm has-[:focus-visible]:outline-2",
              option === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={`${id}-${name}`}
              value={option}
              checked={option === value}
              onChange={() => {
                onChange(option);
              }}
            />
            {(LABELS[name] as Record<string, string>)[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Display preferences (theme, text size, motion, contrast). The form is usable on its own too. */
export function DisplayPreferencesForm() {
  const preferences = useDisplayPreferences();
  const update = <K extends Key>(key: K, value: DisplayPreferences[K]) => {
    setDisplayPreferences({ ...preferences, [key]: value });
  };
  return (
    <div className="grid gap-5">
      <Choice
        name="theme"
        legend="Theme"
        hint="Dark mode can be easier on the eyes in low light."
        options={THEMES}
        value={preferences.theme}
        onChange={(v) => {
          update("theme", v);
        }}
      />
      <Choice
        name="textSize"
        legend="Text size"
        hint="Enlarges all text and spacing, as well as anything your browser zoom does."
        options={TEXT_SIZES}
        value={preferences.textSize}
        onChange={(v) => {
          update("textSize", v);
        }}
      />
      <Choice
        name="motion"
        legend="Motion"
        hint="Turns off animations and transitions."
        options={MOTIONS}
        value={preferences.motion}
        onChange={(v) => {
          update("motion", v);
        }}
      />
      <Choice
        name="contrast"
        legend="Contrast"
        hint="Stronger text colours, borders and focus outlines, and underlined links."
        options={CONTRASTS}
        value={preferences.contrast}
        onChange={(v) => {
          update("contrast", v);
        }}
      />
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDisplayPreferences(DEFAULT_DISPLAY);
          }}
        >
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}

/** Header button that opens the display preferences in a dialog. */
export function AccessibilityMenu({ className }: { className?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className={className}>
          <Accessibility className="size-4" aria-hidden />
          <span>Accessibility</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Accessibility and display</DialogTitle>
          <DialogDescription>
            Saved on this device only. Changes apply straight away, on every page.
          </DialogDescription>
        </DialogHeader>
        <DisplayPreferencesForm />
      </DialogContent>
    </Dialog>
  );
}
