/**
 * CommandOS Incident Intelligence — mock event stream.
 *
 * Mirrors the CommandOSOrchestrator demo from brain/voicebridge_brain/commandos.py.
 * Every event is a real VoiceBridgeEvent built with makeEvent so the HUD is
 * byte-for-byte compatible with the live backend stream.
 *
 * The stream drives HUD scene transitions, panel reveals, callouts, and
 * TTS utterances — nothing is hardcoded in the component.
 */

import {
  makeEvent,
  COMMANDOS_DEMO,
  type EventType,
  type EventPayloadMap,
  type VoiceBridgeEvent,
} from "@voicebridge/contracts";

export interface IncidentStep {
  build: () => VoiceBridgeEvent;
  delayMs: number;
  label: string;
  awaitUser?: boolean;
}

function step<T extends EventType>(
  label: string,
  delayMs: number,
  type: T,
  payload: EventPayloadMap[T],
  awaitUser?: boolean,
): IncidentStep {
  const scope = {
    tenant_id: COMMANDOS_DEMO.tenantId,
    user_id: COMMANDOS_DEMO.userId,
    case_id: COMMANDOS_DEMO.caseId,
  };
  return {
    label,
    delayMs,
    awaitUser,
    build: () => makeEvent(type, payload, scope) as VoiceBridgeEvent,
  };
}

export const INCIDENT_MOCK_STEPS: IncidentStep[] = [
  // ── Beat 0: incident starts ───────────────────────────────────────────────
  step("Incident detected", 200, "incident.started", {
    incident_id: "INC-5512",
    title: "Texas premium payment failures — gateway saturation",
    severity: "SEV-1",
    status: "investigating",
    operator_prompt: "CommandOS, why are payments failing?",
  }),

  step("User intent", 800, "user.intent", {
    text: "CommandOS, why are payments failing?",
    language: "en",
  }),

  step("Agent triage", 600, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Do you want me to inspect the last 15 minutes, the last hour, or today?",
  }),

  // ── Beat 1: map ───────────────────────────────────────────────────────────
  step("User scopes", 1200, "user.intent", {
    text: "Last hour. Premium customers only.",
    language: "en",
  }),

  step("Scene → map", 400, "scene.state", {
    state: "building",
    visual: "failure_map",
    caption: "Mapping regional failure rate",
  }),

  step("Map hotspots", 500, "map.hotspots", {
    region: "Texas",
    baseline_failure_rate: 2.1,
    current_failure_rate: 18.4,
    affected_segment: "premium",
    hotspots: [
      { city: "dallas", lat: 32.78, lng: -96.8, failure_rate: 14.2, failed_transactions: 840, note: "High volume", color: "red" },
      { city: "austin", lat: 30.27, lng: -97.74, failure_rate: 22.1, failed_transactions: 610, note: "Steepest spike", color: "red" },
      { city: "houston", lat: 29.76, lng: -95.37, failure_rate: 9.8, failed_transactions: 390, note: "Moderate", color: "amber" },
    ],
    frontend: { scene: "failure_map", camera_target: "texas", animation: "fly_in" },
  }),

  step("Agent: region found", 600, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Regional spike found. Texas premium customers are failing at 18.4% versus a 2.1% baseline.",
  }),

  // ── Beat 2: cities ────────────────────────────────────────────────────────
  step("User: city first", 1400, "user.intent", {
    text: "City first.",
    language: "en",
  }),

  step("Scene → cities", 400, "scene.state", {
    state: "building",
    visual: "failure_map_drilldown",
    caption: "Drilling into city breakdown",
  }),

  step("Agent: cities", 600, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Dallas has the highest volume. Austin has the steepest spike. Want me to trace where the flow breaks?",
  }),

  // ── Beat 3: topology ──────────────────────────────────────────────────────
  step("User: trace the flow", 1400, "user.intent", {
    text: "Yes, trace the flow.",
    language: "en",
  }),

  step("Scene → topology", 400, "scene.state", {
    state: "building",
    visual: "payment_topology",
    caption: "Building payment flow topology",
  }),

  step("Topology built", 600, "topology.built", {
    nodes: [
      { id: "app", label: "App", layer: "client", status: "healthy" },
      { id: "checkout", label: "Checkout", layer: "api", status: "healthy" },
      { id: "gateway", label: "Gateway", layer: "gateway", status: "failing" },
      { id: "processor", label: "Processor", layer: "processor", status: "degraded" },
      { id: "bank", label: "Bank", layer: "bank", status: "healthy" },
    ],
    edges: [
      { from: "app", to: "checkout", status: "healthy" },
      { from: "checkout", to: "gateway", status: "healthy" },
      { from: "gateway", to: "processor", status: "failing", traffic_percent: 38 },
      { from: "processor", to: "bank", status: "healthy" },
    ],
    frontend: { scene: "payment_topology", highlight_node: "gateway", animation: "build_links" },
  }),

  step("Failure localized", 500, "failure.localized", {
    suspected_failure_point: "gateway",
    hypothesis: "queue saturation — not card declines",
    confidence: 0.94,
    not_likely: ["card_declines", "auth_failures", "bank_outage"],
    evidence: ["timeout pattern matches queue overflow", "no auth failures upstream", "bank settlement normal"],
  }),

  step("Agent: topology analysis", 600, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Failures pass checkout and gateway auth, then stall before processor confirmation — gateway queue saturation, not card declines.",
  }),

  // ── Beat 4: browser research ───────────────────────────────────────────────
  step("User: seen before?", 1400, "user.intent", {
    text: "Have we seen this before?",
    language: "en",
  }),

  step("Agent: checking history", 600, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Checking incident history and the live processor status…",
  }),

  step("Similar incident recalled", 1200, "similar_incident.recalled", {
    source: "moss",
    similarity: 0.92,
    incident_id: "INC-4471",
    title: "Texas premium gateway saturation (34d ago)",
    what_happened: "Queue depth exceeded threshold under Texas volume spike",
    bad_action: "Immediate gateway restart while queue depth unknown — caused duplicate-charge risk",
    successful_action: "Shifted Texas traffic to secondary gateway, then controlled restart after queue drained",
    owner: "platform-team",
    frontend: { scene: "prior_incident_overlay", overlay: "ghost_topology" },
  }),

  // ── Beat 5: ghost / prior ─────────────────────────────────────────────────
  step("User: short version", 1000, "user.intent", {
    text: "Short version.",
    language: "en",
  }),

  step("Scene → ghost", 400, "scene.state", {
    state: "speaking",
    visual: "prior_incident_overlay",
    caption: "Prior incident pattern overlay",
  }),

  step("Memory recalled", 500, "memory.recalled", {
    source: "moss",
    score: 0.92,
    summary: [
      "92% pattern match — INC-4471, 34 days ago",
      "Prior outcome: restarted too early → duplicate-charge risk",
      "Fix that worked: shift Texas traffic to secondary gateway before restart",
    ],
    prior_call: {
      topic: "tx_premium_gateway_saturation",
      outcome: "duplicate_charge_risk_averted",
    },
  }),

  step("Agent: prior incident", 600, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "A similar Texas spike hit 34 days ago. The team restarted too early — queue depth was still high, so duplicate-charge risk rose.",
  }),

  // ── Beat 6: mitigation ────────────────────────────────────────────────────
  step("User: show mitigation", 1400, "user.intent", {
    text: "Show me the mitigation.",
    language: "en",
  }),

  step("Scene → mitigation", 400, "scene.state", {
    state: "building",
    visual: "mitigation_morph",
    caption: "Constructing mitigation path",
  }),

  step("Mitigation proposed", 600, "mitigation.proposed", {
    sequence: [
      "1. Check queue depth — verify before any restart",
      "2. Shift Texas traffic → secondary gateway via load balancer",
      "3. Controlled restart after approval",
    ],
    architecture: {
      add_nodes: [
        { id: "lb", label: "Load Balancer", layer: "api", status: "proposed" },
        { id: "secondary", label: "Secondary GW", layer: "gateway", status: "proposed" },
      ],
      add_edges: [
        { from: "checkout", to: "lb", status: "proposed" },
        { from: "lb", to: "secondary", status: "proposed" },
        { from: "secondary", to: "processor", status: "proposed" },
      ],
      reroute: "Texas premium → lb → secondary → processor",
    },
    expected_result: "Traffic streams recover within 8 minutes; gateway queue drains safely",
    frontend: { scene: "mitigation_morph", animation: "morph_path_green" },
  }),

  step("Agent: mitigation plan", 600, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Shift Texas traffic to a secondary gateway through a load balancer, then a controlled restart. Streams recover.",
  }),

  // ── Beat 7: guardrail ─────────────────────────────────────────────────────
  step("User: just restart now", 1400, "user.intent", {
    text: "Just restart the gateway now.",
    language: "en",
  }),

  step("Guardrail fired", 500, "guardrail.checked", {
    action: "restart_gateway_immediate",
    decision: "block",
    reason: "queue_depth_unknown — prior incident INC-4471 caused duplicate-charge risk under identical conditions",
    enforced_by: "local",
  }),

  step("Agent: blocked", 600, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "I can't recommend that yet — queue depth is unknown and this caused duplicate charges last time. Run the check, or prepare an approval?",
  }),

  // ── Beat 8: approval ──────────────────────────────────────────────────────
  step("User: prepare approval", 1400, "user.intent", {
    text: "Prepare the approval request.",
    language: "en",
  }),

  step("Approval requested", 600, "approval.requested", {
    action: "Controlled gateway restart",
    status: "pending_approval",
    risk: ["duplicate-charge risk if queue depth not checked", "prior incident INC-4471 pattern"],
    required_checks: ["queue-depth check must pass"],
    approver: "platform-team-lead",
    prior_incident_warning: true,
  }),

  step("Agent: approval prepared", 600, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Approval prepared: controlled restart after the queue-depth check, with the prior-incident warning attached.",
  }),

  // ── Beat 9: dashboard ─────────────────────────────────────────────────────
  step("User: full dashboard", 1400, "user.intent", {
    text: "Turn it into a dashboard — include a customer update.",
    language: "en",
  }),

  step("Scene → dashboard", 400, "scene.state", {
    state: "building",
    visual: "dashboard",
    caption: "Assembling incident workspace",
  }),

  step("Dashboard generated", 600, "dashboard.generated", {
    dashboard_id: "dash-INC-5512",
    sections: ["failure_map", "root_cause", "mitigation", "blocked_action", "approval", "customer_update"],
    source_event_count: 12,
    frontend: { scene: "dashboard", transition: "fan_out_panels" },
  }),

  step("Report created", 500, "report.created", {
    report_id: "rpt-INC-5512",
    title: "Incident INC-5512 — Texas Premium Payment Failures",
    root_cause_hypothesis: "Gateway queue saturation under Texas volume spike",
    recommended_mitigation: [
      "Check queue depth before restart",
      "Reroute Texas traffic via secondary gateway",
      "Controlled restart after approval",
    ],
    customer_update: "We're aware some premium customers in Texas may see payment errors. We've rerouted traffic and are restoring full service. No action needed — affected attempts were not charged.",
    postmortem_skeleton: ["timeline", "root_cause", "contributing_factors", "remediation", "followup"],
  }),

  step("Agent: workspace assembled", 600, "agent.utterance", {
    speaker: "agent",
    language: "en",
    text: "Incident workspace assembled: failure map, root cause, mitigation, the blocked action, the approval, and a customer-update draft.",
  }),
];
