"use client";

/**
 * Member-side live context feed. Surfaces the brain's non-utterance events
 * (memory recalled, knowledge retrieved, guardrail decisions, language switch,
 * memory writes, audit) so the member sees that their profile and prior claim
 * context are actually driving the call. This is the user-facing mirror of the
 * insurer portal's runtime trace (Agent 7 owns the portal; this is read-only).
 */

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
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Pill tone={KIND_TONE[item.kind]}>{KIND_LABEL[item.kind]}</Pill>
                <span className="text-sm text-vb-text">{item.title}</span>
              </div>
              {item.detail ? (
                <span className="pl-1 text-xs leading-relaxed text-vb-muted">
                  {item.detail}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
