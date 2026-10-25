"use client";

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useDisplayPreferences } from "@/lib/use-display-preferences";

/** Toast host. Follows the theme chosen in the accessibility panel (or the device's). */
const Toaster = (props: ToasterProps) => {
  const { theme } = useDisplayPreferences();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" aria-hidden />,
        info: <InfoIcon className="size-4" aria-hidden />,
        warning: <TriangleAlertIcon className="size-4" aria-hidden />,
        error: <OctagonXIcon className="size-4" aria-hidden />,
        loading: <Loader2Icon className="size-4 animate-spin" aria-hidden />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
