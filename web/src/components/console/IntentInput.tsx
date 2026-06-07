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
    <Panel title="Say something" subtitle="text or quick action">
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
          rows={2}
          disabled={disabled}
          className="w-full resize-none rounded-lg border border-vb-border bg-vb-bg px-3 py-2.5 text-sm text-vb-text placeholder:text-vb-muted focus:border-vb-accent focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-vb-muted">Enter to send · Shift+Enter for a new line</span>
          <ConsoleButton type="submit" tone="accent" disabled={disabled || !text.trim()}>
            Send
          </ConsoleButton>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_INTENTS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => send(q)}
            className="rounded-full border border-vb-border bg-vb-surface-2 px-3 py-1.5 text-xs text-vb-text transition hover:border-vb-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>
    </Panel>
  );
}
