"use client";

/**
 * Correction taps. Each tap publishes `user.correction` with one of the
 * contract `CORRECTION_KINDS`. The brain (Agent 4 / MOSS) writes the profile
 * update; the console just expresses the member's correction as a visible
 * action and reflects which corrections were applied this call.
 */

import { CORRECTION_KINDS, type CorrectionKind } from "@voicebridge/contracts";
import { ConsoleButton, Panel, Pill } from "./ui";

const LABEL: Record<CorrectionKind, string> = {
  less_formal: "Less formal",
  shorter: "Shorter",
  slower: "Slower",
  ask_first_next_time: "Ask me first next time",
};

export function CorrectionBar({
  applied,
  onCorrect,
}: {
  /** Correction kinds already applied this call (for visible feedback). */
  applied: ReadonlySet<CorrectionKind>;
  onCorrect: (kind: CorrectionKind) => void;
}) {
  return (
    <Panel title="Adjust tone & pace" subtitle="updates your profile">
      <div className="flex flex-wrap gap-2">
        {CORRECTION_KINDS.map((kind) => {
          const done = applied.has(kind);
          return (
            <ConsoleButton
              key={kind}
              tone={done ? "approve" : "neutral"}
              onClick={() => onCorrect(kind)}
            >
              {LABEL[kind]}
              {done ? " ✓" : ""}
            </ConsoleButton>
          );
        })}
      </div>
      {applied.size > 0 ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-vb-muted">
          Learned this call:
          {[...applied].map((k) => (
            <Pill key={k} tone="approve">
              {LABEL[k]}
            </Pill>
          ))}
        </p>
      ) : null}
    </Panel>
  );
}
