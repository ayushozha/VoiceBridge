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
import { DEMO_SCRIPT } from "@/lib/portalMock";
import { CallStatePanel } from "./CallStatePanel";
import { SponsorBadges, type IntegrationModes } from "./SponsorBadges";
import { RuntimeTrace } from "./RuntimeTrace";
import { ConsentAuditLog } from "./ConsentAuditLog";
import { OutcomeCard } from "./OutcomeCard";
import { TranscriptPanel } from "./TranscriptPanel";

type ReplayState = "idle" | "playing" | "done";

export function PortalDashboard({
  modes,
  liveRoom,
}: {
  modes: IntegrationModes;
  /** True when wrapped in a connected LiveKit room (observer). */
  liveRoom: boolean;
}) {
  const { events, inject } = useVoiceBridgeEvents();
  const [replay, setReplay] = useState<ReplayState>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Once any event arrives over the live channel, treat the call as live.
  const liveEventSeen = liveRoom && events.length > 0 && replay === "idle";
  const source: "live" | "mock" = liveEventSeen ? "live" : "mock";

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const playMock = useCallback(() => {
    clearTimers();
    setReplay("playing");
    let cumulative = 0;
    DEMO_SCRIPT.forEach((step, i) => {
      cumulative += step.delayMs;
      const t = setTimeout(() => {
        // Re-stamp so timestamps reflect replay time (nice for the trace clock).
        const stamped: VoiceBridgeEvent = { ...step.event, timestamp: new Date().toISOString() };
        inject(stamped);
        if (i === DEMO_SCRIPT.length - 1) setReplay("done");
      }, cumulative);
      timers.current.push(t);
    });
  }, [clearTimers, inject]);

  useEffect(() => clearTimers, [clearTimers]);

  const showReplayControls = !liveEventSeen;

  return (
    <div className="space-y-4">
      {/* Top row: call state + replay control */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="flex-1">
          <CallStatePanel events={events} source={source} />
        </div>
        {showReplayControls && (
          <div className="flex flex-col justify-center gap-2 rounded-xl border border-vb-border bg-vb-surface p-5 lg:w-64">
            <span className="text-[10px] uppercase tracking-widest text-vb-muted">
              {liveRoom ? "No live call yet" : "Standalone mode"}
            </span>
            <button
              type="button"
              onClick={playMock}
              disabled={replay === "playing"}
              className="rounded-lg bg-vb-accent px-4 py-2 text-sm font-medium text-vb-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {replay === "playing"
                ? "Replaying…"
                : replay === "done"
                  ? "Replay demo again"
                  : "Replay demo"}
            </button>
            <p className="text-[11px] leading-snug text-vb-muted">
              Plays the scripted H-48291 claim call so the full sponsor trace and
              outcome render without a live brain.
            </p>
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
