"use client";

/**
 * Small shared primitives for the User Console (Agent 6). Kept local to the
 * console so they can be tuned for a fast, legible, demo-friendly layout using
 * the vb-* palette without touching globals.css or other surfaces.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonTone = "neutral" | "accent" | "approve" | "danger" | "warn";

const TONE: Record<ButtonTone, string> = {
  neutral:
    "border-vb-border bg-vb-surface-2 text-vb-text hover:border-vb-accent hover:bg-vb-surface",
  accent:
    "border-transparent bg-vb-accent text-vb-bg hover:brightness-110 font-medium",
  approve:
    "border-transparent bg-vb-accent-2 text-vb-bg hover:brightness-110 font-medium",
  danger:
    "border-vb-danger/60 bg-transparent text-vb-danger hover:bg-vb-danger/10",
  warn: "border-vb-warn/60 bg-transparent text-vb-warn hover:bg-vb-warn/10",
};

interface ConsoleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  children: ReactNode;
}

export function ConsoleButton({
  tone = "neutral",
  className = "",
  children,
  ...rest
}: ConsoleButtonProps) {
  return (
    <button
      {...rest}
      className={[
        "rounded-lg border px-4 py-2.5 text-sm transition",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vb-accent",
        TONE[tone],
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  accent,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** When set, draws a left accent rail (e.g. for the active consent prompt). */
  accent?: "accent" | "warn" | "approve";
}) {
  const rail =
    accent === "warn"
      ? "border-l-4 border-l-vb-warn"
      : accent === "approve"
        ? "border-l-4 border-l-vb-accent-2"
        : accent === "accent"
          ? "border-l-4 border-l-vb-accent"
          : "";
  return (
    <section
      className={`rounded-xl border border-vb-border bg-vb-surface p-5 ${rail}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-vb-muted">
          {title}
        </h2>
        {subtitle ? (
          <span className="text-xs text-vb-muted">{subtitle}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "approve" | "warn" | "muted";
}) {
  const cls =
    tone === "accent"
      ? "bg-vb-accent/15 text-vb-accent"
      : tone === "approve"
        ? "bg-vb-accent-2/15 text-vb-accent-2"
        : tone === "warn"
          ? "bg-vb-warn/15 text-vb-warn"
          : tone === "muted"
            ? "bg-vb-surface-2 text-vb-muted"
            : "bg-vb-surface-2 text-vb-text";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}
