"use client";

/**
 * Active-call state panel for the insurer portal.
 *
 * Derives idle / connecting / in-call / ended from the contract event stream and
 * shows the case scope (tenant / user / case) the call is bound to. Read-only:
 * the portal is an observer.
 */

import { DEMO, type VoiceBridgeEvent } from "@voicebridge/contracts";

export type CallState = "idle" | "connecting" | "in-call" | "ended";

/** Reduce the event log to a single call state. */
export function deriveCallState(events: readonly VoiceBridgeEvent[]): CallState {
  if (events.length === 0) return "idle";
  let state: CallState = "idle";
  for (const e of events) {
    switch (e.type) {
      case "call.started":
        state = "connecting";
        break;
      case "call.agent_joined":
      case "call.audio_ready":
        if (state !== "ended") state = "in-call";
        break;
      case "outcome.created":
        state = "ended";
        break;
      default:
        if (state === "idle") state = "connecting";
    }
  }
  return state;
}

const STATE_META: Record<CallState, { label: string; dot: string; text: string }> = {
  idle: { label: "Idle", dot: "bg-vb-muted", text: "text-vb-muted" },
  connecting: { label: "Connecting", dot: "bg-vb-warn animate-pulse", text: "text-vb-warn" },
  "in-call": { label: "In call", dot: "bg-vb-accent-2 animate-pulse", text: "text-vb-accent-2" },
  ended: { label: "Completed", dot: "bg-vb-accent", text: "text-vb-accent" },
};

function ScopeChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-vb-muted">{label}</span>
      <code className="text-sm text-vb-text">{value}</code>
    </div>
  );
}

export function CallStatePanel({
  events,
  source,
}: {
  events: readonly VoiceBridgeEvent[];
  /** Whether events are arriving from a live LiveKit room or the local mock. */
  source: "live" | "mock";
}) {
  const state = deriveCallState(events);
  const meta = STATE_META[state];

  return (
    <section className="rounded-xl border border-vb-border bg-vb-surface p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot}`} aria-hidden />
          <div>
            <h2 className="text-sm font-medium text-vb-text">Active call</h2>
            <p className={`text-lg font-semibold ${meta.text}`}>{meta.label}</p>
          </div>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest ${
            source === "live"
              ? "border-vb-accent-2/40 text-vb-accent-2"
              : "border-vb-border text-vb-muted"
          }`}
        >
          {source === "live" ? "Live room" : "Replay"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-vb-border pt-4">
        <ScopeChip label="Tenant" value={DEMO.tenantDisplayName} />
        <ScopeChip label="Member" value={DEMO.userDisplayName} />
        <ScopeChip label="Case" value={DEMO.caseId} />
      </div>
    </section>
  );
}
