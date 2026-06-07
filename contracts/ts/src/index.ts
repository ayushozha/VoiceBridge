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
export const COMMANDOS_EVENT_TOPIC = "commandos.events" as const;

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

export const COMMANDOS_DEMO = {
  tenantId: "atlaspay",
  tenantDisplayName: "AtlasPay",
  userId: "ayush_demo",
  userDisplayName: "Ayush",
  caseId: "sev1_tx_payments_2026_06_07",
  incidentTitle: "Texas premium payment failures",
} as const;

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
  "incident.started",
  "query.scoped",
  "map.hotspots",
  "topology.built",
  "failure.localized",
  "similar_incident.recalled",
  "mitigation.proposed",
  "approval.requested",
  "dashboard.generated",
  "report.created",
  "scene.state",
  "hud.component",
  "memory.recalled",
  "knowledge.retrieved",
  "web.search.results",
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
  /** Stable per-event ID for replay/dedupe; backend should set this. */
  event_id?: string;
  /** Monotonic sequence within a backend-generated stream. */
  sequence?: number;
  /** Conversational turn this event belongs to. */
  turn_id?: string;
  /** Correlates tool calls, guardrails, and scene changes. */
  correlation_id?: string;
  /** Whether this event came from a live integration, stub, or unavailable path. */
  mode?: IntegrationMode;
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

export interface IncidentStartedPayload {
  incident_id: string;
  title: string;
  severity: "SEV-1" | "SEV-2" | "SEV-3" | string;
  status: "investigating" | "mitigating" | "resolved" | string;
  operator_prompt: string;
}

export interface QueryScopedPayload {
  window: string;
  segment: string;
  clarification: string;
  scope_chips: string[];
}

export interface IncidentCityHotspot {
  city: string;
  lat: number;
  lng: number;
  failure_rate: number;
  failed_transactions: number;
  note: string;
  color: "red" | "amber" | "green" | string;
}

export interface MapHotspotsPayload {
  region: string;
  baseline_failure_rate: number;
  current_failure_rate: number;
  affected_segment: string;
  hotspots: IncidentCityHotspot[];
  frontend: {
    scene: "failure_map";
    camera_target: string;
    animation: string;
  };
}

export interface TopologyNode {
  id: string;
  label: string;
  layer: "client" | "api" | "gateway" | "processor" | "bank" | string;
  status: "healthy" | "degraded" | "failing" | "proposed" | string;
}

export interface TopologyEdge {
  from: string;
  to: string;
  status: "healthy" | "degraded" | "failing" | "proposed" | string;
  traffic_percent?: number;
}

export interface TopologyBuiltPayload {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  frontend: {
    scene: "payment_topology";
    highlight_node: string;
    animation: string;
  };
}

export interface FailureLocalizedPayload {
  suspected_failure_point: string;
  hypothesis: string;
  confidence: number;
  not_likely: string[];
  evidence: string[];
}

export interface SimilarIncidentRecalledPayload {
  source: "moss" | "local";
  similarity: number;
  incident_id: string;
  title: string;
  what_happened: string;
  bad_action: string;
  successful_action: string;
  owner: string;
  frontend: {
    scene: "prior_incident_overlay";
    overlay: string;
  };
}

export interface MitigationProposedPayload {
  sequence: string[];
  architecture: {
    add_nodes: TopologyNode[];
    add_edges: TopologyEdge[];
    reroute: string;
  };
  expected_result: string;
  frontend: {
    scene: "mitigation_morph";
    animation: string;
  };
}

export interface ApprovalRequestedPayload {
  action: string;
  status: "blocked" | "pending_approval" | "approved" | string;
  risk: string[];
  required_checks: string[];
  approver: string;
  prior_incident_warning: boolean;
}

export interface DashboardGeneratedPayload {
  dashboard_id: string;
  sections: string[];
  source_event_count: number;
  frontend: {
    scene: "dashboard";
    transition: string;
  };
}

export interface ReportCreatedPayload {
  report_id: string;
  title: string;
  root_cause_hypothesis: string;
  recommended_mitigation: string[];
  customer_update: string;
  postmortem_skeleton: string[];
}

export interface SceneStatePayload {
  state: "idle" | "listening" | "thinking" | "building" | "speaking" | string;
  visual: string;
  caption: string;
}

export interface HudComponentItem {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number;
  emphasis?: boolean;
}

export interface HudComponentPayload {
  /** Stable component id; re-emitting with the same id targets the same component. */
  id: string;
  /** render = create/replace by id; patch = shallow-merge fields; remove = delete. */
  op: "render" | "patch" | "remove";
  component: "metric_grid" | "bar_chart" | "ranked_list" | "callout" | "timeline" | "map";
  title?: string;
  subtitle?: string;
  items?: HudComponentItem[];
  /** Optional camera/scene to animate to, e.g. "failure_map", "payment_topology". */
  scene_hint?: string;
  /** Provenance label, e.g. "moss", "exa", "computed". */
  source?: string;
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

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResultsPayload {
  query: string;
  results: WebSearchResult[];
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
  claim_status?: string;
  claim_number?: string;
  missing_documents?: string[];
  deadline?: string;
  sensitive_info_shared?: SensitiveField[];
  approvals: string[];
  language_switch?: { from: LanguageCode; to: LanguageCode };
  preference_learned?: string;
  follow_up?: string;
  incident_status?: string;
  root_cause_hypothesis?: string;
  blocked_actions?: string[];
  customer_update?: string;
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
  | EventEnvelope<"incident.started", IncidentStartedPayload>
  | EventEnvelope<"query.scoped", QueryScopedPayload>
  | EventEnvelope<"map.hotspots", MapHotspotsPayload>
  | EventEnvelope<"topology.built", TopologyBuiltPayload>
  | EventEnvelope<"failure.localized", FailureLocalizedPayload>
  | EventEnvelope<"similar_incident.recalled", SimilarIncidentRecalledPayload>
  | EventEnvelope<"mitigation.proposed", MitigationProposedPayload>
  | EventEnvelope<"approval.requested", ApprovalRequestedPayload>
  | EventEnvelope<"dashboard.generated", DashboardGeneratedPayload>
  | EventEnvelope<"report.created", ReportCreatedPayload>
  | EventEnvelope<"scene.state", SceneStatePayload>
  | EventEnvelope<"hud.component", HudComponentPayload>
  | EventEnvelope<"memory.recalled", MemoryRecalledPayload>
  | EventEnvelope<"knowledge.retrieved", KnowledgeRetrievedPayload>
  | EventEnvelope<"web.search.results", WebSearchResultsPayload>
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
  "incident.started": IncidentStartedPayload;
  "query.scoped": QueryScopedPayload;
  "map.hotspots": MapHotspotsPayload;
  "topology.built": TopologyBuiltPayload;
  "failure.localized": FailureLocalizedPayload;
  "similar_incident.recalled": SimilarIncidentRecalledPayload;
  "mitigation.proposed": MitigationProposedPayload;
  "approval.requested": ApprovalRequestedPayload;
  "dashboard.generated": DashboardGeneratedPayload;
  "report.created": ReportCreatedPayload;
  "scene.state": SceneStatePayload;
  "hud.component": HudComponentPayload;
  "memory.recalled": MemoryRecalledPayload;
  "knowledge.retrieved": KnowledgeRetrievedPayload;
  "web.search.results": WebSearchResultsPayload;
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
  "inspect_payment_failures",
  "build_spatial_failure_model",
  "recall_similar_incidents",
  "retrieve_runbook_policy",
  "propose_mitigation",
  "check_action_guardrail",
  "prepare_approval_request",
  "generate_incident_dashboard",
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
  metadata: Partial<
    Pick<
      EventEnvelope<T, EventPayloadMap[T]>,
      "event_id" | "sequence" | "turn_id" | "correlation_id" | "mode"
    >
  > = {},
): EventEnvelope<T, EventPayloadMap[T]> {
  return {
    type,
    tenant_id: scope.tenant_id ?? DEMO.tenantId,
    user_id: scope.user_id ?? DEMO.userId,
    case_id: scope.case_id ?? DEMO.caseId,
    timestamp: timestamp ?? new Date().toISOString(),
    ...metadata,
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
