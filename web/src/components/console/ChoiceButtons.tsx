"use client";

/**
 * Generic quick-choice prompt. When the agent surfaces a decision (e.g.
 * "Confirm same claim / Different claim / Ask what they see" or
 * "Ask upload link / Ask deadline / Ask for adjuster"), the member taps one and
 * we publish `user.choice`.
 */

import { ConsoleButton, Panel } from "./ui";

export interface ChoicePrompt {
  /** What the choice answers — echoed back in the user.choice payload. */
  prompt: string;
  options: string[];
}

export function ChoiceButtons({
  prompt,
  options,
  onChoose,
}: ChoicePrompt & { onChoose: (choice: string) => void }) {
  return (
    <Panel title="Your move" accent="accent" animate>
      <div className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-vb-accent/15 text-vb-accent">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>
        <p className="text-sm leading-relaxed text-vb-text">{prompt}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt, i) => (
          <ConsoleButton
            key={opt}
            tone={i === 0 ? "accent" : "neutral"}
            onClick={() => onChoose(opt)}
          >
            {opt}
          </ConsoleButton>
        ))}
      </div>
    </Panel>
  );
}
