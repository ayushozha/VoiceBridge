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

const STATE_META: Record<CallState, { label: string; dot: string; text: string; glow: string }> = {
  idle: { label: "Idle", dot: "bg-vb-muted/60", text: "text-vb-muted", glow: "" },
  connecting: { label: "Connecting…", dot: "bg-vb-warn animate-live", text: "text-vb-warn", glow: "glow-warn" },
  "in-call": { label: "In call", dot: "bg-vb-accent-2 animate-live", text: "text-vb-accent-2", glow: "glow-approve" },
  ended: { label: "Completed", dot: "bg-vb-accent", text: "text-vb-accent", glow: "" },
};

function ScopeChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-vb-muted/70">{label}</span>
      <code className="text-sm font-medium text-vb-text">{value}</code>
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
    <section className={`rounded-xl border border-vb-border bg-vb-surface p-5 transition-shadow duration-300 ${meta.glow}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-vb-surface-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot}`} aria-hidden />
            {(state === "in-call" || state === "connecting") && (
              <span className={`absolute inset-0 rounded-lg animate-pulse-ring opacity-50`} />
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-vb-muted">Active call</p>
            <p className={`text-base font-semibold ${meta.text}`}>{meta.label}</p>
          </div>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest ${
            source === "live"
              ? "border-vb-accent-2/40 bg-vb-accent-2/5 text-vb-accent-2"
              : "border-vb-border bg-vb-surface-2 text-vb-muted"
          }`}
        >
          {source === "live" && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-vb-accent-2 animate-live" />
          )}
          {source === "live" ? "Live room" : "Replay"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4 rounded-lg border border-vb-border/60 bg-vb-surface-2/40 px-4 py-3">
        <ScopeChip label="Tenant" value={DEMO.tenantDisplayName} />
        <ScopeChip label="Member" value={DEMO.userDisplayName} />
        <ScopeChip label="Case" value={DEMO.caseId} />
      </div>
    </section>
  );
}
