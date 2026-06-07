"use client";

/**
 * Member-side live context feed. Surfaces the brain's non-utterance events
 * (memory recalled, knowledge retrieved, guardrail decisions, language switch,
 * memory writes, audit) so the member sees that their profile and prior claim
 * context are actually driving the call. This is the user-facing mirror of the
 * insurer portal's runtime trace (Agent 7 owns the portal; this is read-only).
 */

import type { JSX } from "react";
import type { VoiceBridgeEvent } from "@voicebridge/contracts";
import { Panel, Pill } from "./ui";

export interface ContextItem {
  id: string;
  kind: "memory" | "knowledge" | "guardrail" | "language" | "write" | "audit";
  title: string;
  detail?: string;
}

const KIND_TONE: Record<ContextItem["kind"], "accent" | "approve" | "warn" | "muted"> = {
  memory: "accent",
  knowledge: "accent",
  guardrail: "warn",
  language: "accent",
  write: "approve",
  audit: "muted",
};

const KIND_LABEL: Record<ContextItem["kind"], string> = {
  memory: "MOSS recall",
  knowledge: "knowledge",
  guardrail: "guardrail",
  language: "language",
  write: "memory write",
  audit: "audit",
};

const KIND_ICON: Record<ContextItem["kind"], JSX.Element> = {
  memory: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  knowledge: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  guardrail: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  language: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  write: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  audit: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
};

export function deriveContext(events: VoiceBridgeEvent[]): ContextItem[] {
  const items: ContextItem[] = [];
  events.forEach((e, i) => {
    switch (e.type) {
      case "memory.recalled":
        items.push({
          id: `${i}`,
          kind: "memory",
          title: "Recalled your profile & prior claim",
          detail: e.payload.summary.join(" · "),
        });
        break;
      case "knowledge.retrieved":
        items.push({
          id: `${i}`,
          kind: "knowledge",
          title: "Matched insurer document",
          detail: e.payload.matches.join(" · "),
        });
        break;
      case "guardrail.checked":
        items.push({
          id: `${i}`,
          kind: "guardrail",
          title:
            e.payload.decision === "block"
              ? "Held a sensitive disclosure"
              : "Cleared a safe action",
          detail: e.payload.reason,
        });
        break;
      case "language.switched":
        items.push({
          id: `${i}`,
          kind: "language",
          title: `Switched ${e.payload.from} → ${e.payload.to}`,
          detail: e.payload.context_preserved ? "Claim context preserved" : undefined,
        });
        break;
      case "memory.written":
        items.push({
          id: `${i}`,
          kind: "write",
          title: `Saved: ${e.payload.event}`,
        });
        break;
      case "audit.saved":
        items.push({
          id: `${i}`,
          kind: "audit",
          title: "Audit record saved",
          detail: e.payload.record_id,
        });
        break;
      default:
        break;
    }
  });
  return items;
}

export function ContextPanel({ items }: { items: ContextItem[] }) {
  return (
    <Panel title="What memory is doing" subtitle="live">
      {items.length === 0 ? (
        <p className="py-4 text-sm text-vb-muted">
          Profile, prior claim context, and guardrail decisions will show here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const tone = KIND_TONE[item.kind];
            const iconColor =
              tone === "accent" ? "text-vb-accent" :
              tone === "approve" ? "text-vb-accent-2" :
              tone === "warn" ? "text-vb-warn" : "text-vb-muted";
            const iconBg =
              tone === "accent" ? "bg-vb-accent/10" :
              tone === "approve" ? "bg-vb-accent-2/10" :
              tone === "warn" ? "bg-vb-warn/10" : "bg-vb-surface-2";
            return (
              <li key={item.id} className="flex items-start gap-2.5 rounded-lg border border-vb-border/60 bg-vb-surface-2/50 px-3 py-2.5">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${iconBg} ${iconColor}`}>
                  {KIND_ICON[item.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={tone}>{KIND_LABEL[item.kind]}</Pill>
                    <span className="text-xs font-medium text-vb-text">{item.title}</span>
                  </div>
                  {item.detail ? (
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-vb-muted">
                      {item.detail}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
