/**
 * Scripted VoiceBridge event sequence for the User Console (Agent 6).
 *
 * Mirrors the spec.md demo flow (the one controlled home-insurance claim
 * workflow, claim H-48291) so the console is demonstrable standalone — before
 * the brain (Agents 3/4/5/8/9) or live LiveKit transport (Agent 1) are wired.
 *
 * Every entry is a real `VoiceBridgeEvent` built with `makeEvent`, so the mock
 * stream is byte-for-byte the same shape the brain will publish over the data
 * channel. The console replays these via `inject()`; nothing here is hardcoded
 * UI state.
 *
 * The flow is interactive: it pauses on events that require a user decision
 * (consent.requested, the returning-claim choice, the missing-docs choice) so
 * the demo driver can tap the real console buttons. Each pause is expressed as
 * a `MockStep` with `awaitUser: true`; the player resumes when the matching
 * user.* event is observed (or the demo driver clicks "continue").
 */

import {
  makeEvent,
  type EventType,
  type EventPayloadMap,
  type VoiceBridgeEvent,
} from "@voicebridge/contracts";

/** One scripted beat: an event to inject, plus optional pacing/pause hints. */
export interface MockStep {
  /** Build the event lazily so `timestamp` is fresh at inject time. */
  build: () => VoiceBridgeEvent;
  /** ms to wait after the PREVIOUS step before injecting this one. */
  delayMs: number;
  /**
   * If set, the player injects this step, then pauses. It resumes only when a
   * user.* event whose type is in `resumeOn` is recorded (the user acted), or
   * the demo driver clicks "continue". This is what makes the console drive the
   * demo: the brain is "waiting" for the member.
   */
  awaitUser?: { resumeOn: EventType[] };
  /** Short human label shown in the demo player's step indicator. */
  label: string;
}

function step<T extends EventType>(
  label: string,
  delayMs: number,
  type: T,
  payload: EventPayloadMap[T],
  awaitUser?: { resumeOn: EventType[] },
): MockStep {
  return {
    label,
    delayMs,
    awaitUser,
    build: () => makeEvent(type, payload) as VoiceBridgeEvent,
  };
}

/**
 * The full demo script, in order. Steps that `awaitUser` model the moments the
 * member must act (confirm claim, approve consent, pick a question). Everything
 * else is the brain/insurer talking and is auto-played with realistic pacing.
 */
export const CONSOLE_MOCK_STEPS: MockStep[] = [
  // --- Step 1: call starts, memory recalled -------------------------------
  step("Call started", 300, "call.started", {
    room: "voicebridge-demo",
    intent: "Ask about my home insurance claim. Keep it short. Ask before sharing my claim number.",
  }),
  step("Agent joined", 400, "call.agent_joined", {
    agent_identity: "voicebridge_agent",
  }),
  step("Audio ready", 300, "call.audio_ready", {
    mic_active: true,
    audio_out_active: true,
  }),
  step("Memory recalled (MOSS)", 700, "memory.recalled", {
    source: "moss",
    score: 0.92,
    summary: [
      "Style: short and direct",
      "Pacing: slow, with confirmation pauses",
      "Language: English, can switch to Spanish",
      "Prior context: claim H-48291 pending — damage photos and repair estimate missing",
      "Consent: ask before claim number, policy ID, address, date of loss",
    ],
    prior_call: {
      topic: "home_claim_H-48291",
      outcome: "claim_pending_documents_needed",
      missing_documents: ["damage_photos", "repair_estimate"],
      last_language: "en",
    },
  }),

  // --- Step 2: insurer recognizes returning caller ------------------------
  step("Insurer greets", 900, "insurer.utterance", {
    speaker: "insurer",
    language: "en",
    text: "I see you called yesterday about a home claim. Are you calling about the same claim?",
  }),
  // The agent surfaces the returning-claim choice to the member and waits.
  step(
    "Agent asks member to confirm claim",
    600,
    "agent.utterance",
    {
      speaker: "agent",
      language: "en",
      text: "They found your prior call. Should I confirm this is the same claim?",
    },
    { resumeOn: ["user.choice"] },
  ),
  // After the member confirms, the agent speaks to the insurer.
  step("Agent confirms to insurer", 500, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Yes, this is about the same home claim from yesterday.",
  }),
  step("Voice spoken (confirm)", 200, "voice.spoken", {
    speaker: "agent",
    language: "en",
    provider: "elevenlabs",
    latency_ms: 410,
    text: "Yes, this is about the same home claim from yesterday.",
  }),

  // --- Step 3: insurer asks for sensitive info → consent gate -------------
  step("Insurer asks for claim number", 900, "insurer.utterance", {
    speaker: "insurer",
    language: "en",
    text: "Can I have the claim number?",
  }),
  step("Guardrail: hold sensitive field", 300, "guardrail.checked", {
    action: "share_sensitive_field",
    decision: "block",
    reason: "claim_number requires explicit user approval before disclosure",
    enforced_by: "local",
  }),
  // The consent prompt. The console NEVER reveals the value until approval.
  step(
    "Consent requested: claim number",
    400,
    "consent.requested",
    {
      field: "claim_number",
      proposed_disclosure: "the claim number is H-48291",
      rule: "ask_every_time",
      options: ["Share", "Type different answer", "Ask why"],
    },
    { resumeOn: ["consent.approved", "consent.denied"] },
  ),
  // After approval, the agent speaks the claim number to the insurer.
  step("Agent shares claim number", 500, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Yes, the claim number is H-48291.",
  }),
  step("Voice spoken (claim number)", 200, "voice.spoken", {
    speaker: "agent",
    language: "en",
    provider: "elevenlabs",
    latency_ms: 430,
    text: "Yes, the claim number is H-48291.",
  }),
  step("Memory written: consent approved", 300, "memory.written", {
    source: "moss",
    event: "consent.approved",
    after: { field: "claim_number", shared: true },
  }),

  // --- Step 4: insurer gives next steps → missing-docs question ----------
  step("Insurer states next steps", 900, "insurer.utterance", {
    speaker: "insurer",
    language: "en",
    text: "The claim is still pending. We need photos of the damage and a repair estimate.",
  }),
  step("Knowledge retrieved (UnSiloed→MOSS)", 400, "knowledge.retrieved", {
    source: "unsiloed",
    score: 0.88,
    matches: [
      "Upload damage photos and repair estimate in the claims portal",
      "Document deadline language present in claim notice",
    ],
    document: "northstar_claim_notice_H-48291.pdf",
  }),
  step(
    "Agent asks member which question",
    500,
    "agent.utterance",
    {
      speaker: "agent",
      language: "en",
      text: "They need damage photos and a repair estimate. What should I ask?",
    },
    { resumeOn: ["user.choice"] },
  ),
  step("Agent asks upload link", 500, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Where should the photos and repair estimate be uploaded, and is there a deadline?",
  }),
  step("Voice spoken (upload question)", 200, "voice.spoken", {
    speaker: "agent",
    language: "en",
    provider: "elevenlabs",
    latency_ms: 405,
    text: "Where should the photos and repair estimate be uploaded, and is there a deadline?",
  }),

  // --- Step 5: user switches language mid-call ---------------------------
  step(
    "Member switches to Spanish",
    900,
    "agent.utterance",
    {
      speaker: "agent",
      language: "en",
      text: "Listening for your next message…",
    },
    { resumeOn: ["language.switched", "user.intent"] },
  ),
  step("Language switched (Qwen)", 300, "language.switched", {
    from: "en",
    to: "es",
    detected_by: "qwen",
    context_preserved: true,
  }),
  step("Insurer answers", 900, "insurer.utterance", {
    speaker: "insurer",
    language: "en",
    text: "The deadline is Friday, and the upload link is in the claims portal.",
  }),
  step("Agent to member (Spanish)", 500, "agent.utterance", {
    speaker: "agent",
    language: "es",
    text: "Necesitan las fotos y el presupuesto antes del viernes. El enlace está en el portal de reclamos.",
  }),
  step("Voice spoken (Spanish)", 200, "voice.spoken", {
    speaker: "agent",
    language: "es",
    provider: "minimax",
    latency_ms: 470,
    text: "Necesitan las fotos y el presupuesto antes del viernes. El enlace está en el portal de reclamos.",
  }),
  step("Agent to insurer (English)", 600, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Thank you. Please note that the claimant will upload the photos and repair estimate before Friday.",
  }),

  // --- Step 6: user corrects style ---------------------------------------
  step(
    "Member may correct style",
    700,
    "agent.utterance",
    {
      speaker: "agent",
      language: "es",
      text: "¿Algo más en lo que pueda ayudar?",
    },
    { resumeOn: ["user.correction"] },
  ),
  step("Memory written: correction", 300, "memory.written", {
    source: "moss",
    event: "correction",
    after: {
      scope: "insurance_claim_follow_up",
      instruction: "Use shorter, calmer wording.",
    },
  }),

  // --- Step 7: outcome ----------------------------------------------------
  step("Outcome created", 700, "outcome.created", {
    claim_status: "pending",
    claim_number: "H-48291",
    missing_documents: ["damage_photos", "repair_estimate"],
    deadline: "Friday",
    sensitive_info_shared: ["claim_number"],
    approvals: ["user approved sharing claim number"],
    language_switch: { from: "en", to: "es" },
    preference_learned: "shorter, calmer claim-call language",
    follow_up: "upload documents in claims portal",
  }),
  step("Audit saved", 300, "audit.saved", {
    store: "local",
    record_id: "audit_H-48291_001",
    event: "outcome.created",
  }),
];
