"use client";

/**
 * Free-text intent input plus quick-action chips. Publishes `user.intent`.
 * This is how the member starts driving the call without speaking.
 */

import { useState } from "react";
import type { LanguageCode } from "@voicebridge/contracts";
import { ConsoleButton, Panel } from "./ui";

const QUICK_INTENTS = [
  "Ask about my home insurance claim. Keep it short.",
  "Ask before sharing my claim number.",
  "What documents are still missing?",
  "Is there a deadline?",
];

export function IntentInput({
  language,
  onSubmit,
  disabled,
}: {
  language: LanguageCode;
  onSubmit: (text: string, language: LanguageCode) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");

  function send(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed, language);
    setText("");
  }

  return (
    <Panel title="Say something" subtitle="Enter or quick-tap">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex flex-col gap-3"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Type what you want to say or ask…"
          rows={3}
          disabled={disabled}
          className={[
            "w-full resize-none rounded-xl border bg-vb-bg px-4 py-3 text-sm text-vb-text",
            "placeholder:text-vb-muted/60 transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-vb-accent/40",
            "disabled:opacity-50",
            text.trim()
              ? "border-vb-accent/50 shadow-[0_0_0_1px_rgba(79,140,255,0.15)]"
              : "border-vb-border hover:border-vb-border-subtle",
          ].join(" ")}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-vb-muted/70">
            Enter to send &middot; Shift+Enter for new line
          </span>
          <ConsoleButton type="submit" tone="accent" disabled={disabled || !text.trim()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Send
          </ConsoleButton>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {QUICK_INTENTS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => send(q)}
            className="rounded-full border border-vb-border bg-vb-surface-2 px-3 py-1.5 text-xs text-vb-muted transition-all duration-150 hover:border-vb-accent/60 hover:bg-vb-surface-3 hover:text-vb-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>
    </Panel>
  );
}
