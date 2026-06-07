"use client";

/**
 * HealthBar (Agent 1: call infrastructure).
 *
 * The minimal call-health screen the task requires: room connected, agent
 * joined, mic active, audio output active. Each signal is derived from *real*
 * LiveKit room/participant state plus the agent's `call.audio_ready` contract
 * event — not a hardcoded "OK" — so a teammate can verify the call is actually
 * live. Includes a connect/disconnect control and a standalone "Play demo flow"
 * button that injects the spec mock event stream so the surface is demonstrable
 * without the brain or any sponsor integration.
 *
 * Must be rendered inside a <CallProvider>.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useConnectionState, useParticipants } from "@livekit/components-react";
import {
  ConnectionState,
  Track,
  type Participant,
  type TrackPublication,
} from "livekit-client";
import { DEMO } from "@voicebridge/contracts";
import { useCall } from "@/components/CallProvider";
import { useVoiceBridgeEvents } from "@/lib/useVoiceBridgeEvents";
import { buildMockDemoStream, playMockStream } from "@/lib/livekit";

const AGENT_IDENTITY_HINTS = ["voicebridge", "agent"];

interface Signal {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Publications as a base-typed array. `useParticipants()` yields a union of
 * Local/Remote participants, whose `trackPublications` maps have incompatible
 * iterator value types; widen to the common `TrackPublication` base here.
 */
function publicationsOf(p: Participant): TrackPublication[] {
  const out: TrackPublication[] = [];
  p.trackPublications.forEach((pub) => out.push(pub));
  return out;
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        ok ? "bg-vb-accent-2" : "bg-vb-border"
      }`}
    />
  );
}

export function HealthBar() {
  const { status, error, connect, disconnect, micEnabled, connection } = useCall();
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const { events, inject, latest } = useVoiceBridgeEvents();

  const [demoRunning, setDemoRunning] = useState(false);
  const cancelDemoRef = useRef<(() => void) | null>(null);

  // Did the agent confirm audio is ready? Trust its latest call.audio_ready.
  const audioReady = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e.type === "call.audio_ready") return e.payload;
    }
    return null;
  }, [events]);

  const agentJoinedEvent = useMemo(
    () => events.some((e) => e.type === "call.agent_joined"),
    [events],
  );

  const roomConnected = connectionState === ConnectionState.Connected;

  // The agent participant is any remote whose identity looks like the agent,
  // OR any remote of kind "agent". Either confirms the worker joined the room.
  const agentParticipant = useMemo(
    () =>
      participants.find((p) => {
        const id = (p.identity ?? "").toLowerCase();
        const isAgentKind = (p as { isAgent?: boolean }).isAgent === true;
        return isAgentKind || AGENT_IDENTITY_HINTS.some((h) => id.includes(h));
      }),
    [participants],
  );

  // Mic active: real local mic track published, OR the agent reported it.
  const localMicPublishing = useMemo(
    () =>
      participants.some(
        (p) =>
          (p as { isLocal?: boolean }).isLocal === true &&
          publicationsOf(p).some(
            (pub) => pub.source === Track.Source.Microphone && !pub.isMuted,
          ),
      ),
    [participants],
  );

  // Audio out active: the agent (or any remote) is publishing an audio track,
  // OR the agent reported audio_out_active via call.audio_ready.
  const remoteAudioPublishing = useMemo(
    () =>
      participants.some(
        (p) =>
          (p as { isLocal?: boolean }).isLocal !== true &&
          publicationsOf(p).some((pub) => pub.kind === Track.Kind.Audio),
      ),
    [participants],
  );

  const signals: Signal[] = [
    {
      label: "Room connected",
      ok: roomConnected || demoRunning,
      detail: roomConnected
        ? `room ${connection?.room ?? DEMO.caseId}`
        : demoRunning
          ? "demo mode"
          : status,
    },
    {
      label: "Agent joined",
      ok: Boolean(agentParticipant) || agentJoinedEvent,
      detail: agentParticipant?.identity ?? (agentJoinedEvent ? "via event" : "waiting"),
    },
    {
      label: "Mic active",
      ok: localMicPublishing || micEnabled || Boolean(audioReady?.mic_active),
      detail: localMicPublishing
        ? "publishing"
        : micEnabled
          ? "enabled"
          : audioReady?.mic_active
            ? "agent: ready"
            : "off",
    },
    {
      label: "Audio out active",
      ok: remoteAudioPublishing || Boolean(audioReady?.audio_out_active),
      detail: remoteAudioPublishing
        ? "agent speaking path live"
        : audioReady?.audio_out_active
          ? "agent: ready"
          : "waiting",
    },
  ];

  function startDemo() {
    cancelDemoRef.current?.();
    setDemoRunning(true);
    cancelDemoRef.current = playMockStream(buildMockDemoStream(), inject);
  }

  function stopDemo() {
    cancelDemoRef.current?.();
    cancelDemoRef.current = null;
    setDemoRunning(false);
  }

  useEffect(() => () => cancelDemoRef.current?.(), []);

  const connecting = status === "connecting";

  return (
    <section className="rounded-xl border border-vb-border bg-vb-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-vb-muted">
          Call Health
        </h2>
        <div className="flex items-center gap-2">
          {status === "connected" ? (
            <button
              onClick={() => void disconnect()}
              className="rounded-md border border-vb-border px-3 py-1.5 text-xs font-medium text-vb-text transition hover:border-vb-danger hover:text-vb-danger"
            >
              End call
            </button>
          ) : (
            <button
              onClick={() => void connect()}
              disabled={connecting}
              className="rounded-md bg-vb-accent px-3 py-1.5 text-xs font-medium text-vb-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {connecting ? "Connecting…" : "Start call"}
            </button>
          )}
          {demoRunning ? (
            <button
              onClick={stopDemo}
              className="rounded-md border border-vb-border px-3 py-1.5 text-xs font-medium text-vb-text transition hover:border-vb-warn hover:text-vb-warn"
            >
              Stop demo
            </button>
          ) : (
            <button
              onClick={startDemo}
              className="rounded-md border border-vb-border px-3 py-1.5 text-xs font-medium text-vb-muted transition hover:border-vb-accent hover:text-vb-text"
            >
              Play demo flow
            </button>
          )}
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {signals.map((s) => (
          <li
            key={s.label}
            className="flex items-center justify-between rounded-lg border border-vb-border bg-vb-surface-2 px-3 py-2"
          >
            <span className="flex items-center gap-2 text-sm text-vb-text">
              <Dot ok={s.ok} />
              {s.label}
            </span>
            <span className="text-xs text-vb-muted">{s.detail}</span>
          </li>
        ))}
      </ul>

      {error ? (
        <p className="mt-3 text-xs text-vb-danger">Connection error: {error}</p>
      ) : null}

      {latest ? (
        <p className="mt-3 truncate text-xs text-vb-muted">
          Latest event: <code className="text-vb-text">{latest.type}</code>
        </p>
      ) : null}
    </section>
  );
}
