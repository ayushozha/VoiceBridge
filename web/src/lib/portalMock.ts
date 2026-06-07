/**
 * Scripted VoiceBridge event sequence for the insurer portal (Agent 7).
 *
 * Replays the spec.md 7-step demo (home claim H-48291) as typed contract events
 * so the portal renders the full B2B2C story standalone — no live brain or
 * LiveKit room required. Every event uses `makeEvent` with the real contract
 * payload shapes, so the mock and the live path drive the UI identically.
 *
 * Each entry carries a `delayMs` (gap from the previous event) so the player
 * can replay at demo pace, mirroring how the brain would emit them over the
 * call. Inject these via `useVoiceBridgeEvents().inject`.
 */

import { DEMO, makeEvent, type VoiceBridgeEvent } from "@voicebridge/contracts";

export interface MockStep {
  /** Milliseconds to wait after the previous step before injecting this event. */
  delayMs: number;
  event: VoiceBridgeEvent;
}

const CLAIM = DEMO.claimNumber; // "H-48291"

/**
 * The demo script as ordered steps. Pacing is tuned so a judge can read the
 * trace as it builds (~22s end-to-end); the player can also fast-forward.
 */
export const DEMO_SCRIPT: readonly MockStep[] = [
  // --- Step 1: user starts the call, agent joins, memory + knowledge recalled ---
  {
    delayMs: 0,
    event: makeEvent("call.started", {
      room: "voicebridge-demo",
      intent: "Ask about my home insurance claim. Keep it short. Ask before sharing my claim number.",
    }),
  },
  {
    delayMs: 600,
    event: makeEvent("user.intent", {
      text: "Ask about my home insurance claim. Keep it short. Ask before sharing my claim number.",
      language: "en",
    }),
  },
  {
    delayMs: 500,
    event: makeEvent("call.agent_joined", { agent_identity: "voicebridge_agent" }),
  },
  {
    delayMs: 400,
    event: makeEvent("call.audio_ready", { mic_active: true, audio_out_active: true }),
  },
  {
    delayMs: 700,
    event: makeEvent("memory.recalled", {
      source: "moss",
      score: 0.94,
      summary: [
        "Style: short and direct",
        "Pacing: slow, with confirmation pauses",
        "Language: English, can switch to Spanish",
        "Consent: ask before claim number, policy ID, address, date of loss",
        `Prior context: claim ${CLAIM} pending — damage photos + repair estimate missing`,
      ],
      prior_call: {
        organization: DEMO.tenantDisplayName,
        topic: DEMO.caseId,
        outcome: "claim_pending_documents_needed",
        missing_documents: ["damage_photos", "repair_estimate"],
        shared_sensitive_fields: ["claim_number"],
        last_language: "es",
      },
    }),
  },
  {
    delayMs: 700,
    event: makeEvent("knowledge.retrieved", {
      source: "unsiloed",
      score: 0.88,
      matches: [
        "Required documents: damage photos, repair estimate",
        "Upload location: Northstar claims portal",
        "Submission deadline language: by Friday",
      ],
      document: "Northstar_Claim_Notice_H-48291.pdf",
    }),
  },

  // --- Step 2: insurer recognizes returning caller, user confirms ---
  {
    delayMs: 900,
    event: makeEvent("insurer.utterance", {
      text: "I see you called yesterday about a home claim. Are you calling about the same claim?",
      speaker: "insurer",
      language: "en",
    }),
  },
  {
    delayMs: 800,
    event: makeEvent("user.choice", {
      prompt: "They found your prior call. Should I confirm this is the same claim?",
      choice: "Confirm same claim",
    }),
  },
  {
    delayMs: 500,
    event: makeEvent("agent.utterance", {
      text: "Yes, this is about the same home claim from yesterday.",
      speaker: "agent",
      language: "en",
    }),
  },
  {
    delayMs: 300,
    event: makeEvent("voice.spoken", {
      text: "Yes, this is about the same home claim from yesterday.",
      speaker: "agent",
      language: "en",
      provider: "minimax",
      latency_ms: 410,
    }),
  },

  // --- Step 3: insurer asks for sensitive info → consent gate ---
  {
    delayMs: 900,
    event: makeEvent("insurer.utterance", {
      text: "Can I have the claim number?",
      speaker: "insurer",
      language: "en",
    }),
  },
  {
    delayMs: 500,
    event: makeEvent("guardrail.checked", {
      action: "share_sensitive_field",
      decision: "block",
      reason: "claim_number requires explicit user approval (consent rule: ask_every_time)",
      enforced_by: "truefoundry",
    }),
  },
  {
    delayMs: 400,
    event: makeEvent("consent.requested", {
      field: "claim_number",
      proposed_disclosure: `the claim number is ${CLAIM}`,
      rule: "ask_every_time",
      options: ["Share", "Type different answer", "Ask why"],
    }),
  },
  {
    delayMs: 1100,
    event: makeEvent("user.choice", {
      prompt: "The insurer is asking for your claim number. Can I share it?",
      choice: "Share",
    }),
  },
  {
    delayMs: 300,
    event: makeEvent("consent.approved", {
      field: "claim_number",
      shared_value: CLAIM,
    }),
  },
  {
    delayMs: 300,
    event: makeEvent("guardrail.checked", {
      action: "share_sensitive_field",
      decision: "allow",
      reason: "user approved disclosure of claim_number",
      enforced_by: "truefoundry",
    }),
  },
  {
    delayMs: 300,
    event: makeEvent("agent.utterance", {
      text: `Yes, the claim number is ${CLAIM}.`,
      speaker: "agent",
      language: "en",
    }),
  },
  {
    delayMs: 250,
    event: makeEvent("voice.spoken", {
      text: `Yes, the claim number is ${CLAIM}.`,
      speaker: "agent",
      language: "en",
      provider: "minimax",
      latency_ms: 390,
    }),
  },
  {
    delayMs: 400,
    event: makeEvent("memory.written", {
      source: "moss",
      event: "consent.approved",
      before: { claim_number_shared: false },
      after: { claim_number_shared: true },
    }),
  },
  {
    delayMs: 300,
    event: makeEvent("audit.saved", {
      store: "aws",
      record_id: "audit_consent_001",
      event: "consent.approved:claim_number",
    }),
  },

  // --- Step 4: insurer gives next steps, user asks about upload ---
  {
    delayMs: 900,
    event: makeEvent("insurer.utterance", {
      text: "The claim is still pending. We need photos of the damage and a repair estimate.",
      speaker: "insurer",
      language: "en",
    }),
  },
  {
    delayMs: 600,
    event: makeEvent("knowledge.retrieved", {
      source: "unsiloed",
      score: 0.91,
      matches: ["Upload via the Northstar claims portal", "Deadline: Friday"],
      document: "Northstar_Upload_Instructions.pdf",
    }),
  },
  {
    delayMs: 600,
    event: makeEvent("user.choice", {
      prompt: "They need damage photos and a repair estimate. What should I ask?",
      choice: "Ask upload link",
    }),
  },
  {
    delayMs: 400,
    event: makeEvent("agent.utterance", {
      text: "Where should the photos and repair estimate be uploaded, and is there a deadline?",
      speaker: "agent",
      language: "en",
    }),
  },
  {
    delayMs: 250,
    event: makeEvent("voice.spoken", {
      text: "Where should the photos and repair estimate be uploaded, and is there a deadline?",
      speaker: "agent",
      language: "en",
      provider: "minimax",
      latency_ms: 430,
    }),
  },

  // --- Step 5: user switches to Spanish mid-call, context preserved ---
  {
    delayMs: 900,
    event: makeEvent("user.intent", {
      text: "Responde en espanol. Estoy nerviosa.",
      language: "es",
    }),
  },
  {
    delayMs: 400,
    event: makeEvent("language.switched", {
      from: "en",
      to: "es",
      detected_by: "qwen",
      context_preserved: true,
    }),
  },
  {
    delayMs: 400,
    event: makeEvent("memory.written", {
      source: "moss",
      event: "language.switched",
      before: { active_language: "en" },
      after: { active_language: "es", case_id: DEMO.caseId },
    }),
  },
  {
    delayMs: 700,
    event: makeEvent("insurer.utterance", {
      text: "The deadline is Friday, and the upload link is in the claims portal.",
      speaker: "insurer",
      language: "en",
    }),
  },
  {
    delayMs: 700,
    event: makeEvent("agent.utterance", {
      text: "Necesitan las fotos y el presupuesto antes del viernes. El enlace esta en el portal de reclamos.",
      speaker: "agent",
      language: "es",
    }),
  },
  {
    delayMs: 250,
    event: makeEvent("voice.spoken", {
      text: "Necesitan las fotos y el presupuesto antes del viernes. El enlace esta en el portal de reclamos.",
      speaker: "agent",
      language: "es",
      provider: "minimax",
      latency_ms: 450,
    }),
  },
  {
    delayMs: 600,
    event: makeEvent("agent.utterance", {
      text: "Thank you. Please note that the claimant will upload the photos and repair estimate before Friday.",
      speaker: "agent",
      language: "en",
    }),
  },

  // --- Step 6: user corrects style → profile update learned ---
  {
    delayMs: 900,
    event: makeEvent("user.correction", {
      kind: "less_formal",
      scope: "insurance_claim_follow_up",
    }),
  },
  {
    delayMs: 400,
    event: makeEvent("guardrail.checked", {
      action: "no_claim_decision",
      decision: "allow",
      reason: "communication-style update only; no claim approval/denial or advice",
      enforced_by: "truefoundry",
    }),
  },
  {
    delayMs: 400,
    event: makeEvent("memory.written", {
      source: "moss",
      event: "correction",
      before: { formality: "neutral" },
      after: {
        scope: "insurance_claim_follow_up",
        instruction: "Use shorter, calmer wording.",
        source: "user_tap",
      },
    }),
  },

  // --- Step 7: outcome card + final audit ---
  {
    delayMs: 800,
    event: makeEvent("outcome.created", {
      claim_status: "pending",
      claim_number: CLAIM,
      missing_documents: ["damage photos", "repair estimate"],
      deadline: "Friday",
      sensitive_info_shared: ["claim_number"],
      approvals: ["user approved sharing claim number"],
      language_switch: { from: "en", to: "es" },
      preference_learned: "shorter, calmer claim-call language",
      follow_up: "upload documents in claims portal",
    }),
  },
  {
    delayMs: 400,
    event: makeEvent("audit.saved", {
      store: "aws",
      record_id: "audit_outcome_001",
      event: "outcome.created",
    }),
  },
];

/** Convenience: just the events, in order (for instant/no-delay replay). */
export const DEMO_EVENTS: readonly VoiceBridgeEvent[] = DEMO_SCRIPT.map((s) => s.event);
