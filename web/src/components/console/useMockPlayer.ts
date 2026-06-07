"use client";

/**
 * Drives the scripted `consoleMock.ts` sequence via `inject()` so the console
 * demonstrates the full spec.md flow with no live brain or room.
 *
 * Auto-plays beats with realistic pacing, but PAUSES on steps marked
 * `awaitUser` — those model the moments the member must act (confirm claim,
 * approve consent, pick a question, switch language, correct style). The player
 * resumes when a matching user.* event is observed in the event log, so the
 * demo driver taps the real console controls and the script flows on.
 *
 * The player is event-log-driven: it watches `events` for the resume trigger,
 * which means it works whether the user.* event came from a local publish (no
 * room) or a real round-trip over the data channel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceBridgeEvent } from "@voicebridge/contracts";
import { CONSOLE_MOCK_STEPS, type MockStep } from "@/lib/consoleMock";

export interface MockPlayer {
  running: boolean;
  /** Index of the next step to play (0..steps.length). */
  cursor: number;
  total: number;
  /** True while paused waiting for a member action. */
  awaiting: boolean;
  /** Label of the step currently in flight or being awaited. */
  currentLabel: string | null;
  start: () => void;
  /** Manually resume from an awaitUser pause (the "continue" affordance). */
  resume: () => void;
  reset: () => void;
}

export function useMockPlayer(
  events: VoiceBridgeEvent[],
  inject: (event: VoiceBridgeEvent) => void,
): MockPlayer {
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [awaiting, setAwaiting] = useState(false);

  const steps = CONSOLE_MOCK_STEPS;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The step we are paused on, so we know which user events resume us.
  const awaitingStep = useRef<MockStep | null>(null);
  // Event-log length captured when we entered the await, so we only react to
  // NEW user events (not ones already in the log).
  const awaitBaseline = useRef(0);

  // Always-current reference to playFrom, so the auto-advance recursion calls
  // through the ref instead of capturing the function before it's declared.
  const playFromRef = useRef<(index: number) => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const playFrom = useCallback(
    (index: number) => {
      clearTimer();
      if (index >= steps.length) {
        setRunning(false);
        setAwaiting(false);
        awaitingStep.current = null;
        return;
      }
      const next = steps[index]!;
      timer.current = setTimeout(() => {
        inject(next.build());
        const advanced = index + 1;
        setCursor(advanced);
        if (next.awaitUser) {
          // Pause: wait for a matching user action (or manual resume).
          setAwaiting(true);
          awaitingStep.current = next;
          awaitBaseline.current = -1; // set on the effect below from live length
        } else {
          playFromRef.current(advanced);
        }
      }, next.delayMs);
    },
    [steps, inject, clearTimer],
  );

  // Keep the ref pointing at the latest playFrom (assigning in an effect rather
  // than during render, per the rules of refs).
  useEffect(() => {
    playFromRef.current = playFrom;
  }, [playFrom]);

  // When we enter an await, capture the current event-log length as a baseline.
  useEffect(() => {
    if (awaiting && awaitBaseline.current === -1) {
      awaitBaseline.current = events.length;
    }
  }, [awaiting, events.length]);

  // While awaiting, watch for a NEW user.* event whose type resumes us.
  useEffect(() => {
    if (!awaiting || !awaitingStep.current) return;
    const resumeOn = awaitingStep.current.awaitUser?.resumeOn ?? [];
    const base = awaitBaseline.current;
    if (base < 0) return;
    const fresh = events.slice(base);
    if (fresh.some((e) => resumeOn.includes(e.type))) {
      setAwaiting(false);
      awaitingStep.current = null;
      playFrom(cursor);
    }
  }, [awaiting, events, cursor, playFrom]);

  const start = useCallback(() => {
    clearTimer();
    setRunning(true);
    setAwaiting(false);
    awaitingStep.current = null;
    setCursor(0);
    playFrom(0);
  }, [clearTimer, playFrom]);

  const resume = useCallback(() => {
    if (!awaiting) return;
    setAwaiting(false);
    awaitingStep.current = null;
    playFrom(cursor);
  }, [awaiting, cursor, playFrom]);

  const reset = useCallback(() => {
    clearTimer();
    setRunning(false);
    setAwaiting(false);
    awaitingStep.current = null;
    setCursor(0);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    running,
    cursor,
    total: steps.length,
    awaiting,
    currentLabel: cursor > 0 && cursor <= steps.length ? steps[cursor - 1]!.label : null,
    start,
    resume,
    reset,
  };
}
