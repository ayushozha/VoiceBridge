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
                "rounded-lg border px-4 py-2 text-sm transition",
                active
                  ? "border-vb-accent bg-vb-accent/15 text-vb-accent font-medium"
                  : "border-vb-border bg-vb-surface-2 text-vb-text hover:border-vb-accent",
              ].join(" ")}
            >
              {LABELS[lang] ?? lang}
            </button>
          );
        })}
        {current === "es" ? <Pill tone="accent">en español</Pill> : null}
      </div>
      {current !== "es" ? (
        <button
          type="button"
          onClick={() => onSwitch(current, "es")}
          className="mt-3 text-xs text-vb-muted underline-offset-2 hover:text-vb-accent hover:underline"
        >
          &ldquo;Responde en español&rdquo;
        </button>
      ) : null}
    </Panel>
  );
}
