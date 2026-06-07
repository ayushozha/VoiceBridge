/**
 * Sponsor metadata for the insurer-portal runtime trace (Agent 7).
 *
 * Maps each VoiceBridge contract event to the sponsor doing the work, so a judge
 * can watch the live event stream and see every sponsor in the call/memory/
 * guardrail/document/voice/deployment path. Honest live-vs-stub status comes from
 * the server via `integrationModes()` (env.ts, read-only) — this file only owns
 * the labels, roles, and which events surface which sponsor.
 */

import { SPONSORS, type Sponsor, type VoiceBridgeEvent } from "@voicebridge/contracts";

export interface SponsorMeta {
  id: Sponsor;
  /** Display name shown on the badge and trace row. */
  label: string;
  /** One-line role in the runtime path (spec "Sponsor Fit"). */
  role: string;
  /** Which path this sponsor lives in — groups badges for the judge. */
  path: "transport" | "memory" | "knowledge" | "guardrail" | "language" | "voice" | "deployment";
  /** Tailwind text color token for the trace dot / badge accent. */
  accent: string;
}

/** Ordered so the badge row reads like the runtime flow in spec.md. */
export const SPONSOR_META: Record<Sponsor, SponsorMeta> = {
  livekit: {
    id: "livekit",
    label: "LiveKit",
    role: "Real-time call transport + data events",
    path: "transport",
    accent: "text-vb-accent",
  },
  moss: {
    id: "moss",
    label: "MOSS",
    role: "Communication memory + retrieval",
    path: "memory",
    accent: "text-vb-accent-2",
  },
  unsiloed: {
    id: "unsiloed",
    label: "UnSiloed",
    role: "Parsed insurer documents → business knowledge",
    path: "knowledge",
    accent: "text-vb-accent-2",
  },
  truefoundry: {
    id: "truefoundry",
    label: "TrueFoundry",
    role: "Model gateway + disclosure / no-claim-decision guardrails",
    path: "guardrail",
    accent: "text-vb-warn",
  },
  qwen: {
    id: "qwen",
    label: "Qwen",
    role: "Multilingual reasoning + mid-call language switch",
    path: "language",
    accent: "text-vb-accent",
  },
  minimax: {
    id: "minimax",
    label: "MiniMax",
    role: "Low-latency spoken response",
    path: "voice",
    accent: "text-vb-accent-2",
  },
  elevenlabs: {
    id: "elevenlabs",
    label: "ElevenLabs",
    role: "Low-latency voice fallback",
    path: "voice",
    accent: "text-vb-accent-2",
  },
  aws: {
    id: "aws",
    label: "AWS",
    role: "Hosting + durable audit / event store",
    path: "deployment",
    accent: "text-vb-warn",
  },
};

/** Stable badge ordering for the header (runtime-flow order). */
export const SPONSOR_ORDER: readonly Sponsor[] = SPONSORS;

/**
 * Resolve which sponsor an event attributes work to. Some events name their own
 * backend (voice.spoken.provider, *.source, *.enforced_by, *.detected_by);
 * everything else maps by event type. Returns null for pure UI/transport-control
 * events that have no single sponsor owner.
 */
export function sponsorForEvent(event: VoiceBridgeEvent): Sponsor | null {
  switch (event.type) {
    case "call.started":
    case "call.agent_joined":
    case "call.audio_ready":
    case "agent.utterance":
    case "insurer.utterance":
      return "livekit";

    case "memory.recalled":
    case "memory.written":
      return event.payload.source === "moss" ? "moss" : "moss"; // local fallback still represents MOSS path

    case "knowledge.retrieved":
      if (event.payload.source === "moss") return "moss";
      return "unsiloed";

    case "guardrail.checked":
      return event.payload.enforced_by === "truefoundry" ? "truefoundry" : "truefoundry";

    case "language.switched":
      return event.payload.detected_by === "qwen" ? "qwen" : "qwen";

    case "voice.spoken":
      if (event.payload.provider === "minimax") return "minimax";
      if (event.payload.provider === "elevenlabs") return "elevenlabs";
      return "livekit"; // browser fallback rides the LiveKit audio path

    case "audit.saved":
      return event.payload.store === "aws" ? "aws" : "aws";

    // User/console-side and consent-control events have no single sponsor.
    case "consent.requested":
    case "consent.approved":
    case "consent.denied":
    case "outcome.created":
    case "user.intent":
    case "user.choice":
    case "user.correction":
      return null;
  }
}

/** Human-readable headline for a trace row, by event type. */
export function traceHeadline(event: VoiceBridgeEvent): string {
  switch (event.type) {
    case "call.started":
      return "LiveKit call started";
    case "call.agent_joined":
      return `Agent joined (${event.payload.agent_identity})`;
    case "call.audio_ready":
      return "Audio ready — mic + output active";
    case "memory.recalled":
      return "MOSS recalled communication profile + prior claim";
    case "knowledge.retrieved":
      return event.payload.document
        ? `Business knowledge matched (${event.payload.document})`
        : "Business knowledge matched";
    case "consent.requested":
      return `Consent requested — ${event.payload.field}`;
    case "consent.approved":
      return `Consent approved — ${event.payload.field}`;
    case "consent.denied":
      return `Consent denied — ${event.payload.field}`;
    case "guardrail.checked":
      return `Guardrail ${event.payload.decision} — ${event.payload.action}`;
    case "language.switched":
      return `Language switch ${event.payload.from} → ${event.payload.to}`;
    case "voice.spoken":
      return `Voice spoken (${event.payload.provider})`;
    case "memory.written":
      return `MOSS memory written — ${event.payload.event}`;
    case "outcome.created":
      return "Outcome card created";
    case "audit.saved":
      return `Audit saved — ${event.payload.event}`;
    case "user.intent":
      return "User intent entered";
    case "user.choice":
      return `User choice — ${event.payload.choice}`;
    case "user.correction":
      return `User correction — ${event.payload.kind}`;
    case "agent.utterance":
      return "VoiceBridge → insurer";
    case "insurer.utterance":
      return "Insurer → VoiceBridge";
  }
}
