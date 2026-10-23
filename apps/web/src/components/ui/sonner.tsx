"use client";

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Toast host. Follows the operating-system colour scheme (the app has no theme switcher). */
const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="system"
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

export { Toaster };
