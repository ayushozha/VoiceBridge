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
              {done ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : null}
              {LABEL[kind]}
            </ConsoleButton>
          );
        })}
      </div>
      {applied.size > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-vb-accent-2/20 bg-vb-accent-2/5 px-3 py-2">
          <span className="text-[11px] text-vb-muted">Learned this call:</span>
          {[...applied].map((k) => (
            <Pill key={k} tone="approve">
              {LABEL[k]}
            </Pill>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
