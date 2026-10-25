/**
 * Display preferences chosen in the accessibility panel: theme, text size, motion and contrast.
 * They are per-device conveniences, so they live in localStorage and are applied as attributes on
 * <html>, which the CSS in globals.css responds to. Nothing here is personal data.
 */

export const DISPLAY_STORAGE_KEY = "wg-display";

export const THEMES = ["system", "light", "dark"] as const;
export const TEXT_SIZES = ["standard", "large", "larger"] as const;
export const MOTIONS = ["system", "reduce"] as const;
export const CONTRASTS = ["standard", "high"] as const;

export interface DisplayPreferences {
  readonly theme: (typeof THEMES)[number];
  readonly textSize: (typeof TEXT_SIZES)[number];
  readonly motion: (typeof MOTIONS)[number];
  readonly contrast: (typeof CONTRASTS)[number];
}

export const DEFAULT_DISPLAY: DisplayPreferences = {
  theme: "system",
  textSize: "standard",
  motion: "system",
  contrast: "standard",
};

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Reads stored preferences, falling back to the defaults for anything missing or unrecognised. */
export function parseDisplayPreferences(raw: string | null): DisplayPreferences {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object") {
      stored = parsed as Record<string, unknown>;
    }
  } catch {
    // Corrupt storage: use the defaults.
  }
  return {
    theme: oneOf(THEMES, stored["theme"], DEFAULT_DISPLAY.theme),
    textSize: oneOf(TEXT_SIZES, stored["textSize"], DEFAULT_DISPLAY.textSize),
    motion: oneOf(MOTIONS, stored["motion"], DEFAULT_DISPLAY.motion),
    contrast: oneOf(CONTRASTS, stored["contrast"], DEFAULT_DISPLAY.contrast),
  };
}

interface RootLike {
  readonly classList: { toggle(token: string, force: boolean): unknown };
  readonly dataset: Record<string, string | undefined>;
  style: { colorScheme: string };
}

/** Applies preferences to the document root. `systemDark` is the OS colour-scheme setting. */
export function applyDisplayPreferences(
  prefs: DisplayPreferences,
  root: RootLike,
  systemDark: boolean,
): void {
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && systemDark);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  if (prefs.textSize === "standard") {
    delete root.dataset["text"];
  } else {
    root.dataset["text"] = prefs.textSize;
  }
  if (prefs.motion === "reduce") {
    root.dataset["motion"] = "reduce";
  } else {
    delete root.dataset["motion"];
  }
  if (prefs.contrast === "high") {
    root.dataset["contrast"] = "high";
  } else {
    delete root.dataset["contrast"];
  }
}
/**
 * The same logic as a self-contained script, run in <head> before the page paints so a dark or
 * large-text preference never flashes the defaults first. It carries the CSP nonce.
 */
export const DISPLAY_BOOTSTRAP_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  DISPLAY_STORAGE_KEY,
)})||"{}")||{};var r=document.documentElement;var d=p.theme==="dark"||(p.theme!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";if(p.textSize==="large"||p.textSize==="larger")r.dataset.text=p.textSize;if(p.motion==="reduce")r.dataset.motion="reduce";if(p.contrast==="high")r.dataset.contrast="high";}catch(e){}})();`;
