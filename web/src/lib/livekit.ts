/**
 * Client-side LiveKit helpers (Agent 1: call infrastructure).
 *
 * Thin utilities the CallProvider uses to fetch a token from /api/token and
 * connect a `Room`. Kept framework-agnostic (no React) so they can be reused or
 * unit-tested. The provider owns React lifecycle; this owns the wire details.
 */

import { Room, type RoomConnectOptions } from "livekit-client";
import {
  DEMO,
  makeEvent,
  type EventPayloadMap,
  type EventType,
  type VoiceBridgeEvent,
} from "@voicebridge/contracts";

/** Roles the token route understands. `user` drives the call; `observer` watches. */
export type CallRole = "user" | "insurer" | "observer";

export interface TokenResponse {
  token: string;
  serverUrl: string;
  room: string;
  identity: string;
  role: CallRole;
}

export interface FetchTokenArgs {
  role?: CallRole;
  identity?: string;
  room?: string;
  signal?: AbortSignal;
}

/** Fetch a join token from the server-side mint endpoint. */
export async function fetchToken({
  role = "user",
  identity,
  room,
  signal,
}: FetchTokenArgs = {}): Promise<TokenResponse> {
  const params = new URLSearchParams({ role });
  if (identity) params.set("identity", identity);
  if (room) params.set("room", room);

  const res = await fetch(`/api/token?${params.toString()}`, {
    method: "GET",
    signal,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Token request failed (${res.status})`);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * Create a `Room` tuned for a low-latency voice call. Adaptive stream + dynacast
 * are off (audio-only demo, single agent) to keep the path simple and snappy.
 */
export function createRoom(): Room {
  return new Room({
    adaptiveStream: false,
    dynacast: false,
  });
}

/** Fetch a token (if not supplied) and connect the room. Returns the live Room. */
export async function connectRoom(
  args: FetchTokenArgs & { room?: Room; token?: TokenResponse; connectOptions?: RoomConnectOptions } = {},
): Promise<{ room: Room; token: TokenResponse }> {
  const room = args.room ?? createRoom();
  const token = args.token ?? (await fetchToken(args));
  await room.connect(token.serverUrl, token.token, args.connectOptions);
  return { room, token };
}

// ---------------------------------------------------------------------------
// Mock demo stream — drives the slice standalone, before the brain is wired.
// ---------------------------------------------------------------------------

/** One scripted step: how long to wait, then which contract event to inject. */
export interface MockStep {
  delayMs: number;
  event: VoiceBridgeEvent;
}

function ev<T extends EventType>(type: T, payload: EventPayloadMap[T]): VoiceBridgeEvent {
  // makeEvent<T> is a valid union member; TS can't prove it for a generic T.
  return makeEvent(type, payload) as VoiceBridgeEvent;
}

/**
 * The spec.md demo flow as a sequence of typed contract events. Same shapes the
 * real brain emits, so the UI is identical whether driven by this mock or live.
 * Used by HealthBar / CallProvider demo mode to prove the surface end-to-end
 * without sponsor integrations or a live agent.
 */
export function buildMockDemoStream(): MockStep[] {
  const claim = DEMO.claimNumber;
  return [
    {
      delayMs: 200,
      event: ev("call.started", { room: DEMO.caseId, intent: "Ask about my home insurance claim." }),
    },
    { delayMs: 600, event: ev("call.agent_joined", { agent_identity: "voicebridge_agent" }) },
    { delayMs: 400, event: ev("call.audio_ready", { mic_active: true, audio_out_active: true }) },
    {
      delayMs: 800,
      event: ev("memory.recalled", {
        source: "local",
        summary: [
          "Style: short and direct; pacing slow",
          "Language: English, can switch to Spanish",
          `Prior context: claim ${claim} pending, photos and repair estimate missing`,
        ],
      }),
    },
    {
      delayMs: 1200,
      event: ev("insurer.utterance", {
        text: "I see you called yesterday about a home claim. Are you calling about the same claim?",
        speaker: "insurer",
        language: "en",
      }),
    },
    {
      delayMs: 1500,
      event: ev("consent.requested", {
        field: "claim_number",
        proposed_disclosure: `the claim number is ${claim}`,
        rule: "ask_every_time",
        options: ["Share", "Type different answer", "Ask why"],
      }),
    },
    {
      delayMs: 1500,
      event: ev("consent.approved", { field: "claim_number", shared_value: claim }),
    },
    {
      delayMs: 800,
      event: ev("voice.spoken", {
        text: `Yes, the claim number is ${claim}.`,
        speaker: "agent",
        language: "en",
        provider: "elevenlabs",
        latency_ms: 420,
      }),
    },
    {
      delayMs: 1500,
      event: ev("language.switched", {
        from: "en",
        to: "es",
        detected_by: "local",
        context_preserved: true,
      }),
    },
    {
      delayMs: 1200,
      event: ev("outcome.created", {
        claim_status: "pending",
        claim_number: claim,
        missing_documents: ["damage_photos", "repair_estimate"],
        deadline: "Friday",
        sensitive_info_shared: ["claim_number"],
        approvals: ["user approved sharing claim number"],
        language_switch: { from: "en", to: "es" },
        preference_learned: "shorter, calmer claim-call language",
        follow_up: "upload documents in claims portal",
      }),
    },
  ];
}

/**
 * Play a mock stream into a sink (e.g. `inject` from useVoiceBridgeEvents).
 * Returns a cancel function. No network — purely local, for standalone demos.
 */
export function playMockStream(
  steps: MockStep[],
  sink: (event: VoiceBridgeEvent) => void,
): () => void {
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  let elapsed = 0;
  for (const step of steps) {
    elapsed += step.delayMs;
    timers.push(
      setTimeout(() => {
        if (!cancelled) sink(step.event);
      }, elapsed),
    );
  }

  return () => {
    cancelled = true;
    for (const t of timers) clearTimeout(t);
  };
}
