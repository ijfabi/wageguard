"use client";

import { useSyncExternalStore } from "react";

import {
  DEFAULT_DISPLAY,
  DISPLAY_STORAGE_KEY,
  applyDisplayPreferences,
  parseDisplayPreferences,
  type DisplayPreferences,
} from "./display-preferences";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();
let current: DisplayPreferences | null = null;

function read(): DisplayPreferences {
  if (current === null) {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(DISPLAY_STORAGE_KEY);
    } catch {
      // Storage blocked (private mode, policy): preferences last for this page only.
    }
    current = parseDisplayPreferences(raw);
  }
  return current;
}

function apply(): void {
  applyDisplayPreferences(read(), document.documentElement, window.matchMedia(DARK_QUERY).matches);
}

function notify(): void {
  apply();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    notify();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === DISPLAY_STORAGE_KEY) {
      current = parseDisplayPreferences(event.newValue);
      notify();
    }
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Saves and applies new preferences; every open tab picks them up. */
export function setDisplayPreferences(next: DisplayPreferences): void {
  current = next;
  try {
    window.localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Not persisted, but still applied to this page.
  }
  notify();
}

/** The current display preferences (the defaults during server rendering). */
export function useDisplayPreferences(): DisplayPreferences {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_DISPLAY);
}
