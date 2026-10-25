"use client";

import { useSyncExternalStore } from "react";

import { useDisplayPreferences } from "./use-display-preferences";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
}

/**
 * True when motion should be reduced (WCAG 2.3.3): either the operating system asks for it, or the
 * person chose "Reduce motion" in WageGuard's accessibility panel.
 */
export function useReducedMotion(): boolean {
  const preferences = useDisplayPreferences();
  const system = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true, // server render: assume reduced motion, avoiding an animation flash on hydration
  );
  return system || preferences.motion === "reduce";
}
