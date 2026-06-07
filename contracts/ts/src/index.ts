/**
 * VoiceBridge shared contract (TypeScript mirror).
 *
 * This is the seam between the surface (web + voice transport: Agents 1/2/6/7)
 * and the brain (Agents 3/4/5/8/9). Hand-mirrored from contracts/events.json
 * and the spec. Keep it small; if you add an event/tool, add it in all three
 * mirrors (events.json, ts, python).
 */

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** LiveKit data-channel topic every VoiceBridge event is published under. */
export const EVENT_TOPIC = "voicebridge.events" as const;

// ---------------------------------------------------------------------------
// Demo identifiers (the one controlled insurance claim workflow)
// ---------------------------------------------------------------------------

export const DEMO = {
  tenantId: "northstar_insurance",
  tenantDisplayName: "Northstar Insurance",
  userId: "ayush_demo",
  userDisplayName: "Ayush",
  caseId: "home_claim_H-48291",
  claimNumber: "H-48291",
  languages: ["en", "es"] as const,
} as const;

export type LanguageCode = (typeof DEMO.languages)[number] | string;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const SPONSORS = [
  "livekit",
  "moss",
  "unsiloed",
  "truefoundry",
  "qwen",
  "minimax",
  "elevenlabs",
  "aws",
] as const;
export type Sponsor = (typeof SPONSORS)[number];

export const SENSITIVE_FIELDS = [
  "claim_number",
  "policy_id",
  "address",
  "date_of_loss",
  "phone_number",
  "date_of_birth",
  "ssn",
  "account_number",
  "payment_information",
  "caregiver_contact",
] as const;
export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

export const CONSENT_RULES = [
  "ask_every_time",
  "ask_first_then_remember",
  "never_share",
  "auto_share",
] as const;
export type ConsentRule = (typeof CONSENT_RULES)[number];

export const CORRECTION_KINDS = [
  "less_formal",
  "shorter",
  "slower",
  "ask_first_next_time",
] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];

/** Who/what is speaking the turn carried by an utterance event. */
export type Speaker = "user" | "agent" | "insurer";

/** Whether a sponsor integration is live, a faithful stub, or unavailable. */
export type IntegrationMode = "live" | "stub" | "unavailable";

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

export const EVENT_TYPES = [
  "call.started",
  "call.agent_joined",
  "call.audio_ready",
  "memory.recalled",
  "knowledge.retrieved",
  "consent.requested",
  "consent.approved",
  "consent.denied",
  "guardrail.checked",
  "language.switched",
  "voice.spoken",
  "memory.written",
  "outcome.created",
  "audit.saved",
  "user.intent",
  "user.choice",
  "user.correction",
  "agent.utterance",
  "insurer.utterance",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Common scope + envelope every event carries. */
export interface EventEnvelope<T extends EventType, P> {
  type: T;
  tenant_id: string;
  user_id: string;
  case_id: string;
  /** ISO-8601 UTC timestamp. */
  timestamp: string;
  payload: P;
}

// ---------------------------------------------------------------------------
// Per-event payloads (small + demo-shaped; extend without breaking envelope)
// ---------------------------------------------------------------------------

export interface CallStartedPayload {
  room: string;
  /** Free-text intent the user entered, if any (e.g. "Ask about my home claim"). */
  intent?: string;
}

export interface CallAgentJoinedPayload {
  agent_identity: string;
}

export interface CallAudioReadyPayload {
  /** Round-trip self-check: agent can hear input and produce output. */
  mic_active: boolean;
  audio_out_active: boolean;
}

export interface MemoryRecalledPayload {
  source: "moss" | "local";
  /** Retrieval score, when the backend supplies one. */
  score?: number;
  /** Human-readable summary lines shown in the live context panel. */
  summary: string[];
  /** Optional structured prior-call context. */
  prior_call?: Record<string, unknown>;
}

export interface KnowledgeRetrievedPayload {
  source: "moss" | "unsiloed" | "local";
  score?: number;
  /** What was matched (e.g. upload instructions, deadline language). */
  matches: string[];
  /** Provenance — the parsed source document, if any. */
  document?: string;
}

export interface ConsentRequestedPayload {
  field: SensitiveField;
  /** What the agent would say if approved (e.g. "the claim number is H-48291"). */
  proposed_disclosure: string;
  rule: ConsentRule;
  /** Choices to surface to the user. */
  options: string[];
}

export interface ConsentDecisionPayload {
  field: SensitiveField;
  /** The value actually shared (present only on approval). */
  shared_value?: string;
  /** Alternate answer the user typed instead, if any. */
  alternate?: string;
}

export interface GuardrailCheckedPayload {
  /** e.g. "share_sensitive_field", "claim_decision", "financial_advice". */
  action: string;
  decision: "allow" | "block";
  reason: string;
  /** Which gateway made the call. */
  enforced_by: "truefoundry" | "local";
}

export interface LanguageSwitchedPayload {
  from: LanguageCode;
  to: LanguageCode;
  detected_by: "qwen" | "local";
  /** Confirms claim context survived the switch. */
  context_preserved: boolean;
}

export interface VoiceSpokenPayload {
  text: string;
  speaker: Extract<Speaker, "agent">;
  language: LanguageCode;
  provider: Extract<Sponsor, "minimax" | "elevenlabs"> | "browser";
  /** Latency from final text to first audio byte, in milliseconds. */
  latency_ms?: number;
}

export interface MemoryWrittenPayload {
  source: "moss" | "local";
  /** e.g. "consent.approved", "language.switched", "correction", "outcome". */
  event: string;
  before?: unknown;
  after?: unknown;
}

export interface OutcomeCreatedPayload {
  claim_status: string;
  claim_number?: string;
  missing_documents: string[];
  deadline?: string;
  sensitive_info_shared: SensitiveField[];
  approvals: string[];
  language_switch?: { from: LanguageCode; to: LanguageCode };
  preference_learned?: string;
  follow_up?: string;
}

export interface AuditSavedPayload {
  store: "aws" | "local";
  /** Identifier of the persisted audit record. */
  record_id: string;
  event: string;
}

export interface UserIntentPayload {
  text: string;
  language?: LanguageCode;
}

export interface UserChoicePayload {
  /** Which prompt this choice answers (echoes a prior event id/label). */
  prompt: string;
  choice: string;
}

export interface UserCorrectionPayload {
  kind: CorrectionKind;
  scope?: string;
}

export interface UtterancePayload {
  text: string;
  speaker: Speaker;
  language?: LanguageCode;
}

// ---------------------------------------------------------------------------
// Discriminated union of all events
// ---------------------------------------------------------------------------

export type VoiceBridgeEvent =
  | EventEnvelope<"call.started", CallStartedPayload>
  | EventEnvelope<"call.agent_joined", CallAgentJoinedPayload>
  | EventEnvelope<"call.audio_ready", CallAudioReadyPayload>
  | EventEnvelope<"memory.recalled", MemoryRecalledPayload>
  | EventEnvelope<"knowledge.retrieved", KnowledgeRetrievedPayload>
  | EventEnvelope<"consent.requested", ConsentRequestedPayload>
  | EventEnvelope<"consent.approved", ConsentDecisionPayload>
  | EventEnvelope<"consent.denied", ConsentDecisionPayload>
  | EventEnvelope<"guardrail.checked", GuardrailCheckedPayload>
  | EventEnvelope<"language.switched", LanguageSwitchedPayload>
  | EventEnvelope<"voice.spoken", VoiceSpokenPayload>
  | EventEnvelope<"memory.written", MemoryWrittenPayload>
  | EventEnvelope<"outcome.created", OutcomeCreatedPayload>
  | EventEnvelope<"audit.saved", AuditSavedPayload>
  | EventEnvelope<"user.intent", UserIntentPayload>
  | EventEnvelope<"user.choice", UserChoicePayload>
  | EventEnvelope<"user.correction", UserCorrectionPayload>
  | EventEnvelope<"agent.utterance", UtterancePayload>
  | EventEnvelope<"insurer.utterance", UtterancePayload>;

/** Map from event type to its payload, for typed consumers/builders. */
export interface EventPayloadMap {
  "call.started": CallStartedPayload;
  "call.agent_joined": CallAgentJoinedPayload;
  "call.audio_ready": CallAudioReadyPayload;
  "memory.recalled": MemoryRecalledPayload;
  "knowledge.retrieved": KnowledgeRetrievedPayload;
  "consent.requested": ConsentRequestedPayload;
  "consent.approved": ConsentDecisionPayload;
  "consent.denied": ConsentDecisionPayload;
  "guardrail.checked": GuardrailCheckedPayload;
  "language.switched": LanguageSwitchedPayload;
  "voice.spoken": VoiceSpokenPayload;
  "memory.written": MemoryWrittenPayload;
  "outcome.created": OutcomeCreatedPayload;
  "audit.saved": AuditSavedPayload;
  "user.intent": UserIntentPayload;
  "user.choice": UserChoicePayload;
  "user.correction": UserCorrectionPayload;
  "agent.utterance": UtterancePayload;
  "insurer.utterance": UtterancePayload;
}

// ---------------------------------------------------------------------------
// Agent tool surface (the brain implements these; the surface references names)
// ---------------------------------------------------------------------------

export const AGENT_TOOLS = [
  "search_business_knowledge",
  "recall_customer_context",
  "remember_call_event",
  "check_sensitive_disclosure",
  "parse_business_document",
  "route_guarded_model_call",
  "detect_language_switch",
  "speak_response",
] as const;
export type AgentToolName = (typeof AGENT_TOOLS)[number];

/** Memory/knowledge scope passed on every MOSS read/write. */
export interface MemoryScope {
  tenant_id: string;
  user_id: string;
  case_id: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

export function isVoiceBridgeEvent(value: unknown): value is VoiceBridgeEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === "string" &&
    EVENT_TYPE_SET.has(v.type) &&
    typeof v.tenant_id === "string" &&
    typeof v.user_id === "string" &&
    typeof v.case_id === "string" &&
    typeof v.timestamp === "string" &&
    typeof v.payload === "object" &&
    v.payload !== null
  );
}

/** Build a fully-typed event with the demo scope defaults applied. */
export function makeEvent<T extends EventType>(
  type: T,
  payload: EventPayloadMap[T],
  scope: Partial<MemoryScope> = {},
  timestamp?: string,
): EventEnvelope<T, EventPayloadMap[T]> {
  return {
    type,
    tenant_id: scope.tenant_id ?? DEMO.tenantId,
    user_id: scope.user_id ?? DEMO.userId,
    case_id: scope.case_id ?? DEMO.caseId,
    timestamp: timestamp ?? new Date().toISOString(),
    payload,
  };
}

/** Encode an event to bytes for LiveKit publishData. */
export function encodeEvent(event: VoiceBridgeEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event));
}

/** Decode + validate bytes from a LiveKit data packet. Returns null if invalid. */
export function decodeEvent(data: Uint8Array): VoiceBridgeEvent | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(data));
    return isVoiceBridgeEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
