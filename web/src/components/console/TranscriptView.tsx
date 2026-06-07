"use client";

/**
 * Readable transcript of the call. Derived purely from the typed event stream:
 * insurer.utterance, agent.utterance, voice.spoken (agent voice), plus the
 * member's own user.intent / user.choice / user.correction so the member can
 * see their side of the conversation too.
 *
 * Sensitive values are never reconstructed here — we only render text the brain
 * actually emitted as an utterance (post-consent), so this view cannot leak a
 * value the consent gate is still holding.
 */

import { useEffect, useRef } from "react";
import type { LanguageCode, VoiceBridgeEvent } from "@voicebridge/contracts";
import { Panel, Pill } from "./ui";

export interface TranscriptLine {
  id: string;
  speaker: "user" | "agent" | "insurer";
  text: string;
  language?: LanguageCode;
  /** "spoken" marks an agent line that went to voice (TTS) on the insurer line. */
  spoken?: boolean;
}

const LANG_LABEL: Record<string, string> = { en: "EN", es: "ES" };

/** Project the event log into transcript lines. Pure + deterministic. */
export function deriveTranscript(events: VoiceBridgeEvent[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  events.forEach((e, i) => {
    switch (e.type) {
      case "insurer.utterance":
        lines.push({
          id: `${i}`,
          speaker: "insurer",
          text: e.payload.text,
          language: e.payload.language,
        });
        break;
      case "agent.utterance":
        lines.push({
          id: `${i}`,
          speaker: "agent",
          text: e.payload.text,
          language: e.payload.language,
        });
        break;
      case "user.intent":
        lines.push({
          id: `${i}`,
          speaker: "user",
          text: e.payload.text,
          language: e.payload.language,
        });
        break;
      case "user.choice":
        lines.push({ id: `${i}`, speaker: "user", text: `▸ ${e.payload.choice}` });
        break;
      case "voice.spoken":
        // Mark the most recent matching agent line as spoken, rather than
        // duplicating the text.
        for (let j = lines.length - 1; j >= 0; j--) {
          if (lines[j]!.speaker === "agent" && lines[j]!.text === e.payload.text) {
            lines[j]!.spoken = true;
            break;
          }
        }
        break;
      default:
        break;
    }
  });
  return lines;
}

const SPEAKER_META: Record<
  TranscriptLine["speaker"],
  { label: string; align: string; bubble: string }
> = {
  user: {
    label: "You",
    align: "items-end",
    bubble: "bg-vb-accent/15 text-vb-text border-vb-accent/30",
  },
  agent: {
    label: "VoiceBridge",
    align: "items-start",
    bubble: "bg-vb-surface-2 text-vb-text border-vb-border",
  },
  insurer: {
    label: "Northstar rep",
    align: "items-start",
    bubble: "bg-vb-surface text-vb-muted border-vb-border",
  },
};

export function TranscriptView({ lines }: { lines: TranscriptLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length]);

  return (
    <Panel title="Transcript" subtitle="agent · insurer · you">
      <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1">
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-vb-muted">
            The conversation will appear here as the call runs.
          </p>
        ) : null}
        {lines.map((line) => {
          const meta = SPEAKER_META[line.speaker];
          return (
            <div key={line.id} className={`flex flex-col ${meta.align}`}>
              <div className="mb-1 flex items-center gap-2 text-xs text-vb-muted">
                <span className="font-medium">{meta.label}</span>
                {line.language && LANG_LABEL[line.language] ? (
                  <Pill tone="muted">{LANG_LABEL[line.language]}</Pill>
                ) : null}
                {line.spoken ? <Pill tone="approve">spoken</Pill> : null}
              </div>
              <div
                className={`max-w-[85%] rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed ${meta.bubble}`}
              >
                {line.text}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </Panel>
  );
}
