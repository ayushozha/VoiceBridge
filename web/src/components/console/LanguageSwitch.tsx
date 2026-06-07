"use client";

/**
 * Language control for the member side of the call. Toggling to Spanish (or
 * tapping the "Responde en español" path) sets the user-side language and
 * publishes `language.switched` (detected_by: "local" until Qwen, Agent 9, is
 * wired — the brain may re-emit with detected_by: "qwen"). Claim context is
 * preserved across the switch, so `context_preserved` is always true here.
 */

import { DEMO, type LanguageCode } from "@voicebridge/contracts";
import { ConsoleButton, Panel, Pill } from "./ui";

const LABELS: Record<string, string> = { en: "English", es: "Español" };

export function LanguageSwitch({
  current,
  onSwitch,
}: {
  current: LanguageCode;
  onSwitch: (from: LanguageCode, to: LanguageCode) => void;
}) {
  return (
    <Panel title="Language" subtitle="switches mid-call, keeps claim context">
      <div className="flex flex-wrap items-center gap-2">
        {DEMO.languages.map((lang) => {
          const active = current === lang;
          return (
            <button
              key={lang}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (!active) onSwitch(current, lang);
              }}
              className={[
                "relative rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.97]",
                active
                  ? "border-vb-accent bg-vb-accent/15 text-vb-accent shadow-[0_0_0_1px_rgba(79,140,255,0.2)] glow-accent"
                  : "border-vb-border bg-vb-surface-2 text-vb-text hover:border-vb-accent/60 hover:bg-vb-surface-3",
              ].join(" ")}
            >
              {active && (
                <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-vb-accent">
                  <span className="h-1 w-1 rounded-full bg-vb-bg" />
                </span>
              )}
              {LABELS[lang] ?? lang}
            </button>
          );
        })}
      </div>
      {current !== "es" ? (
        <button
          type="button"
          onClick={() => onSwitch(current, "es")}
          className="mt-3 flex items-center gap-1 text-xs text-vb-muted transition-colors hover:text-vb-accent"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          &ldquo;Responde en español&rdquo;
        </button>
      ) : null}
    </Panel>
  );
}
