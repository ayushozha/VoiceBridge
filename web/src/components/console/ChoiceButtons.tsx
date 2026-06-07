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
    <Panel title="Your move" accent="accent">
      <p className="mb-3 text-base text-vb-text">{prompt}</p>
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
