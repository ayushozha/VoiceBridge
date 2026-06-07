"use client";

/**
 * Shared primitives for the User Console. Upgraded design system:
 * richer button states, gradient-border Panel, animated Pill.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonTone = "neutral" | "accent" | "approve" | "danger" | "warn";

const TONE: Record<ButtonTone, string> = {
  neutral:
    "border-vb-border bg-vb-surface-2 text-vb-text hover:border-vb-accent hover:bg-vb-surface-3 hover:text-vb-text",
  accent:
    "border-transparent bg-vb-accent text-vb-bg hover:brightness-110 font-semibold shadow-lg shadow-vb-accent/20",
  approve:
    "border-transparent bg-vb-accent-2 text-vb-bg hover:brightness-110 font-semibold shadow-lg shadow-vb-accent-2/20",
  danger:
    "border-vb-danger/50 bg-vb-danger/10 text-vb-danger hover:bg-vb-danger/20 hover:border-vb-danger",
  warn: "border-vb-warn/50 bg-vb-warn/10 text-vb-warn hover:bg-vb-warn/20 hover:border-vb-warn",
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
        "inline-flex items-center justify-center gap-1.5",
        "rounded-lg border px-4 py-2.5 text-sm transition-all duration-150",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vb-accent",
        "active:scale-[0.97]",
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
  animate,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Left accent rail variant. */
  accent?: "accent" | "warn" | "approve";
  /** Fade-up entrance animation. */
  animate?: boolean;
}) {
  const rail =
    accent === "warn"
      ? "border-l-2 border-l-vb-warn"
      : accent === "approve"
        ? "border-l-2 border-l-vb-accent-2"
        : accent === "accent"
          ? "border-l-2 border-l-vb-accent"
          : "";

  const glow =
    accent === "warn"
      ? "glow-warn"
      : accent === "approve"
        ? "glow-approve"
        : "";

  return (
    <section
      className={[
        "rounded-xl border border-vb-border bg-vb-surface p-5",
        "transition-shadow duration-300",
        rail,
        glow,
        animate ? "animate-fade-up" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-vb-muted">
          {title}
        </h2>
        {subtitle ? (
          <span className="text-[11px] text-vb-muted/70">{subtitle}</span>
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
      ? "bg-vb-accent/15 text-vb-accent border border-vb-accent/20"
      : tone === "approve"
        ? "bg-vb-accent-2/15 text-vb-accent-2 border border-vb-accent-2/20"
        : tone === "warn"
          ? "bg-vb-warn/15 text-vb-warn border border-vb-warn/20"
          : tone === "muted"
            ? "bg-vb-surface-2 text-vb-muted border border-vb-border"
            : "bg-vb-surface-2 text-vb-text border border-vb-border";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}
