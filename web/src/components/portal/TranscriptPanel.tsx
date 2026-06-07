"use client";

/**
 * Live transcript for the insurer portal.
 *
 * Surfaces the conversational turns — insurer line, VoiceBridge agent output,
 * and user-side intents/choices — so a judge can follow the call narrative next
 * to the runtime trace. Read-only mirror of utterance + user events.
 */

import { type VoiceBridgeEvent, type Speaker } from "@voicebridge/contracts";

interface Turn {
  speaker: Speaker;
  text: string;
  language?: string;
  key: string;
}

function collectTurns(events: readonly VoiceBridgeEvent[]): Turn[] {
  const turns: Turn[] = [];
  events.forEach((e, i) => {
    if (e.type === "insurer.utterance") {
      turns.push({ speaker: "insurer", text: e.payload.text, language: e.payload.language, key: `${i}` });
    } else if (e.type === "agent.utterance") {
      turns.push({ speaker: "agent", text: e.payload.text, language: e.payload.language, key: `${i}` });
    } else if (e.type === "user.intent") {
      turns.push({ speaker: "user", text: e.payload.text, language: e.payload.language, key: `${i}` });
    } else if (e.type === "user.choice") {
      turns.push({ speaker: "user", text: `[${e.payload.choice}]`, key: `${i}` });
    }
  });
  return turns;
}

const SPEAKER_META: Record<Speaker, { label: string; align: string; bubble: string }> = {
  insurer: {
    label: "Insurer",
    align: "items-start",
    bubble: "bg-vb-surface-2 text-vb-text",
  },
  agent: {
    label: "VoiceBridge",
    align: "items-start",
    bubble: "bg-vb-accent/15 text-vb-text border border-vb-accent/30",
  },
  user: {
    label: "Member",
    align: "items-end",
    bubble: "bg-vb-accent-2/15 text-vb-text border border-vb-accent-2/30",
  },
};

export function TranscriptPanel({ events }: { events: readonly VoiceBridgeEvent[] }) {
  const turns = collectTurns(events);

  return (
    <section className="flex h-full flex-col rounded-xl border border-vb-border bg-vb-surface p-5">
      <h2 className="mb-3 text-sm font-medium text-vb-text">Transcript</h2>
      {turns.length === 0 ? (
        <p className="text-sm text-vb-muted">Conversation turns will appear here.</p>
      ) : (
        <ul className="space-y-3 overflow-y-auto pr-1">
          {turns.map((t) => {
            const meta = SPEAKER_META[t.speaker];
            return (
              <li key={t.key} className={`flex flex-col ${meta.align}`}>
                <span className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-widest text-vb-muted">
                  {meta.label}
                  {t.language && t.language !== "en" && (
                    <span className="rounded bg-vb-surface-2 px-1 text-[9px] text-vb-accent">
                      {t.language}
                    </span>
                  )}
                </span>
                <span className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[13px] ${meta.bubble}`}>
                  {t.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
