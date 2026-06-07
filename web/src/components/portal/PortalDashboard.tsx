"use client";

/**
 * Insurer-portal dashboard body (Agent 7).
 *
 * Drives every panel off `useVoiceBridgeEvents()`. When a live brain is emitting
 * over the LiveKit data channel, the trace fills from real events. When there is
 * no live room (or for a deterministic pitch), the "Replay demo" control plays
 * the scripted `portalMock.ts` sequence via `inject()` using the same
 * VoiceBridgeEvent shapes — so the portal is fully demoable standalone.
 *
 * This component assumes it is rendered inside a LiveKit RoomContext OR in
 * mock-only mode; `useVoiceBridgeEvents` tolerates the absence of a room and
 * simply skips outbound publish (the portal is an observer and never publishes).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { type VoiceBridgeEvent } from "@voicebridge/contracts";
import { useVoiceBridgeEvents } from "@/lib/useVoiceBridgeEvents";
import { useMaybeCall } from "@/components/CallProvider";
import { DEMO_SCRIPT } from "@/lib/portalMock";
import { CallStatePanel } from "./CallStatePanel";
import { SponsorBadges, type IntegrationModes } from "./SponsorBadges";
import { RuntimeTrace } from "./RuntimeTrace";
import { ConsentAuditLog } from "./ConsentAuditLog";
import { OutcomeCard } from "./OutcomeCard";
import { TranscriptPanel } from "./TranscriptPanel";

type ReplayState = "idle" | "playing" | "done";

export function PortalDashboard({ modes }: { modes: IntegrationModes }) {
  const { events, inject, reset: resetEvents } = useVoiceBridgeEvents();
  const [replay, setReplay] = useState<ReplayState>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Connected as an observer via Agent 1's CallProvider? (null in mock-only).
  const call = useMaybeCall();
  const liveRoom = call?.status === "connected";

  // Once any event arrives over the live channel, treat the call as live.
  const liveEventSeen = liveRoom && events.length > 0 && replay === "idle";
  const source: "live" | "mock" = liveEventSeen ? "live" : "mock";

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const playMock = useCallback(() => {
    clearTimers();
    resetEvents();
    setReplay("playing");
    let cumulative = 0;
    DEMO_SCRIPT.forEach((step, i) => {
      cumulative += step.delayMs;
      const t = setTimeout(() => {
        const stamped: VoiceBridgeEvent = { ...step.event, timestamp: new Date().toISOString() };
        inject(stamped);
        if (i === DEMO_SCRIPT.length - 1) setReplay("done");
      }, cumulative);
      timers.current.push(t);
    });
  }, [clearTimers, inject, resetEvents]);

  const handleReset = useCallback(() => {
    clearTimers();
    resetEvents();
    setReplay("idle");
  }, [clearTimers, resetEvents]);

  useEffect(() => clearTimers, [clearTimers]);

  // Show replay controls whenever not actively receiving live events.
  const showReplayControls = !liveEventSeen;

  return (
    <div className="space-y-4">
      {/* Connection status banners */}
      {call?.status === "error" && (
        <div className="rounded-xl border border-vb-warn/40 bg-vb-warn/5 px-4 py-3">
          <p className="text-xs font-medium text-vb-warn">Observer connection error</p>
          {call.error && (
            <p className="mt-1 font-mono text-xs text-vb-text/70">{call.error}</p>
          )}
          <p className="mt-1 text-xs text-vb-muted">
            Live event stream unavailable. Use Mock replay to demonstrate the portal.
          </p>
        </div>
      )}
      {call?.status === "connecting" && (
        <div className="rounded-xl border border-vb-border bg-vb-surface-2 px-4 py-3">
          <p className="text-xs text-vb-muted">Connecting to live room as observer…</p>
        </div>
      )}

      {/* Top row: call state + demo controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="flex-1">
          <CallStatePanel events={events} source={source} />
        </div>
        {showReplayControls && (
          <div className="flex flex-col justify-center gap-2 rounded-xl border border-vb-border bg-vb-surface p-5 lg:w-64">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-vb-muted">
                {liveRoom ? "No live events yet" : "Standalone mode"}
              </span>
              <span className="rounded-full border border-vb-border px-2 py-0.5 text-[9px] uppercase tracking-widest text-vb-muted">
                mock
              </span>
            </div>
            <button
              type="button"
              onClick={playMock}
              disabled={replay === "playing"}
              className="rounded-lg bg-vb-accent px-4 py-2 text-sm font-medium text-vb-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {replay === "playing"
                ? "Replaying…"
                : replay === "done"
                  ? "Replay again"
                  : "Replay mock demo"}
            </button>
            {events.length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-vb-border px-4 py-1.5 text-xs text-vb-muted transition hover:border-vb-accent hover:text-vb-text"
              >
                Reset log
              </button>
            )}
            <p className="text-[11px] leading-snug text-vb-muted">
              Scripted H-48291 claim call. Fills the sponsor trace, consent log,
              and outcome without a live brain.
            </p>
          </div>
        )}
        {liveEventSeen && (
          <div className="flex flex-col justify-center gap-2 rounded-xl border border-vb-accent/30 bg-vb-accent/5 p-5 lg:w-64">
            <span className="text-[10px] uppercase tracking-widest text-vb-accent">
              Live room active
            </span>
            <p className="text-[11px] leading-snug text-vb-muted">
              Receiving real events from the member&apos;s call.
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-vb-border px-4 py-1.5 text-xs text-vb-muted transition hover:border-vb-accent hover:text-vb-text"
            >
              Reset log
            </button>
          </div>
        )}
      </div>

      <SponsorBadges modes={modes} events={events} />

      {/* Main split: trace + transcript on the left, audit + outcome on the right */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="max-h-[32rem] xl:max-h-[40rem]">
              <RuntimeTrace events={events} />
            </div>
            <div className="max-h-[32rem] xl:max-h-[40rem]">
              <TranscriptPanel events={events} />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <OutcomeCard events={events} />
          <ConsentAuditLog events={events} />
        </div>
      </div>
    </div>
  );
}
