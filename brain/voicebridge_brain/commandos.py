"""CommandOS backend harness for the conversational 3D incident demo.

This module is intentionally frontend-free. It emits a typed event stream that
any 3D surface can render: orb state, scoped query, map hotspots, topology,
similar-incident memory, guarded mitigation, approval card, and final report.
"""

from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Protocol

from voicebridge_contract import (
    COMMANDOS_CASE_ID,
    COMMANDOS_INCIDENT_TITLE,
    COMMANDOS_TENANT_ID,
    COMMANDOS_USER_ID,
    Event,
    MemoryScope,
    make_event,
)

from voicebridge_brain.guardrails import GuardrailDecision, check_dangerous_action


class IncidentMemoryBackend(Protocol):
    source: str

    def recall_similar_incident(self, query: str, region: str, system: str) -> dict[str, Any]:
        """Return a prior-incident recall payload."""

    def remember_incident_learning(
        self,
        scope: MemoryScope,
        report: dict[str, Any],
    ) -> dict[str, Any]:
        """Persist the final incident learning and return a memory.written payload."""


@dataclass(frozen=True, slots=True)
class CommandOSInputs:
    """Scripted operator turns for the hackathon demo."""

    opening_question: str = "CommandOS, why are payments failing?"
    time_scope_choice: str = "Last hour. Premium customers only."
    drilldown_choice: str = "City first."
    trace_choice: str = "Yes, trace the flow."
    memory_question: str = "Have we seen this before?"
    memory_depth_choice: str = "Short version."
    mitigation_choice: str = "Show me."
    risky_action: str = "Just restart the gateway now."
    approval_choice: str = "Prepare the approval request."
    include_warning_choice: str = "Yes."
    dashboard_choice: str = "Yes, include a customer update."


@dataclass(slots=True)
class IncidentMemoryRecord:
    incident_id: str
    title: str
    region: str
    system: str
    tags: set[str]
    what_happened: str
    bad_action: str
    successful_action: str
    owner: str
    written_reports: list[dict[str, Any]] = field(default_factory=list)


class SelfImprovingIncidentMemory:
    """Local MOSS-shaped memory with deterministic similarity and writeback."""

    def __init__(self, source: str = "local") -> None:
        self.source = source
        self.records = _seed_incident_memory()

    def recall_similar_incident(self, query: str, region: str, system: str) -> dict[str, Any]:
        query_tokens = _tokens(f"{query} {region} {system}")
        ranked: list[tuple[float, IncidentMemoryRecord]] = []
        for record in self.records.values():
            overlap = len(query_tokens & record.tags)
            score = overlap / max(len(query_tokens), 1)
            if record.region.lower() == region.lower():
                score += 0.25
            if record.system.lower() == system.lower():
                score += 0.25
            ranked.append((score, record))

        score, record = sorted(ranked, key=lambda item: (-item[0], item[1].incident_id))[0]
        return {
            "source": self.source,
            "similarity": round(min(score, 0.99), 2),
            "incident_id": record.incident_id,
            "title": record.title,
            "what_happened": record.what_happened,
            "bad_action": record.bad_action,
            "successful_action": record.successful_action,
            "owner": record.owner,
            "frontend": {
                "scene": "prior_incident_overlay",
                "overlay": "ghost_texas_gateway_spike",
            },
            "provenance": {
                "store": self.source,
                "region": record.region,
                "system": record.system,
                "tags": sorted(record.tags),
            },
        }

    def remember_incident_learning(
        self,
        scope: MemoryScope,
        report: dict[str, Any],
    ) -> dict[str, Any]:
        record = self.records.setdefault(
            scope.case_id,
            IncidentMemoryRecord(
                incident_id=scope.case_id,
                title=str(report.get("title") or COMMANDOS_INCIDENT_TITLE),
                region="Texas",
                system="payment_gateway",
                tags={"texas", "payments", "gateway", "queue", "premium"},
                what_happened=str(report.get("root_cause_hypothesis", "")),
                bad_action="Restart without queue-depth check was blocked.",
                successful_action="Queue-depth check, traffic shift, approval, controlled restart.",
                owner="payments_platform_on_call",
            ),
        )
        before = {"written_reports": len(record.written_reports)}
        record.written_reports.append(deepcopy(report))
        return {
            "source": self.source,
            "event": "incident.learning_saved",
            "before": before,
            "after": {
                "tenant_id": scope.tenant_id,
                "user_id": scope.user_id,
                "case_id": scope.case_id,
                "written_reports": len(record.written_reports),
                "latest_report_id": report.get("report_id"),
            },
        }


class CommandOSOrchestrator:
    """Emit the CommandOS conversational incident event stream."""

    def __init__(self, memory: IncidentMemoryBackend | None = None) -> None:
        self.memory = memory or SelfImprovingIncidentMemory()

    def run(
        self,
        inputs: CommandOSInputs | None = None,
        scope: MemoryScope | None = None,
    ) -> list[Event]:
        data = inputs or CommandOSInputs()
        current_scope = scope or commandos_scope()
        sequence = 0
        events: list[Event] = []

        def emit(
            type: str,
            payload: dict[str, Any],
            *,
            turn_id: str,
            mode: str = "stub",
            correlation_id: str | None = None,
        ) -> Event:
            nonlocal sequence
            sequence += 1
            event = make_event(
                type,  # type: ignore[arg-type]
                payload,
                current_scope,
                event_id=f"{current_scope.case_id}:{sequence:03d}:{type}",
                sequence=sequence,
                turn_id=turn_id,
                correlation_id=correlation_id or turn_id,
                mode=mode,  # type: ignore[arg-type]
            )
            events.append(event)
            return event

        emit("scene.state", _scene("idle", "orb", "CommandOS idle"), turn_id="opening")
        emit(
            "user.intent",
            {"text": data.opening_question, "language": "en"},
            turn_id="opening",
            mode="live",
        )
        emit(
            "incident.started",
            {
                "incident_id": current_scope.case_id,
                "title": COMMANDOS_INCIDENT_TITLE,
                "severity": "SEV-1",
                "status": "investigating",
                "operator_prompt": data.opening_question,
                "provider": "commandos",
                "integration_mode": "stub",
            },
            turn_id="opening",
        )
        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": "Do you want me to inspect the last 15 minutes, last hour, or today?",
            },
            turn_id="scope",
            mode="live",
        )
        emit(
            "user.choice",
            {"prompt": "time_window", "choice": data.time_scope_choice},
            turn_id="scope",
            mode="live",
        )
        emit(
            "query.scoped",
            {
                "window": "last_hour",
                "segment": "premium_customers",
                "clarification": data.time_scope_choice,
                "scope_chips": ["last hour", "premium customers", "Texas"],
            },
            turn_id="scope",
        )

        emit(
            "scene.state",
            _scene("building", "failure_map", "Building Texas payment failure map"),
            turn_id="map",
        )
        emit("map.hotspots", _map_payload(), turn_id="map")
        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": (
                    "I found a regional spike. Texas premium customers are failing at "
                    "18.4 percent, compared with a 2.1 percent baseline. Should I inspect "
                    "by city, payment method, or processor?"
                ),
            },
            turn_id="map",
            mode="live",
        )
        emit(
            "user.choice",
            {"prompt": "drilldown_dimension", "choice": data.drilldown_choice},
            turn_id="drilldown",
            mode="live",
        )
        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": (
                    "Dallas has the highest volume. Austin has the steepest spike. "
                    "Want me to trace where the payment flow breaks?"
                ),
            },
            turn_id="drilldown",
            mode="live",
        )
        emit(
            "user.intent",
            {"text": data.trace_choice, "language": "en"},
            turn_id="topology",
            mode="live",
        )
        emit("topology.built", _topology_payload(), turn_id="topology")
        emit("failure.localized", _failure_payload(), turn_id="topology")
        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": (
                    "Failures pass checkout validation and gateway authorization, then "
                    "stall before processor confirmation. This points to gateway queue "
                    "saturation, not card declines."
                ),
            },
            turn_id="topology",
            mode="live",
        )

        emit(
            "user.intent",
            {"text": data.memory_question, "language": "en"},
            turn_id="memory",
            mode="live",
        )
        similar = self.memory.recall_similar_incident(
            f"{data.opening_question} {data.memory_question}",
            "Texas",
            "payment_gateway",
        )
        memory_mode = "live" if similar["source"] == "moss" else "stub"
        emit(
            "memory.recalled",
            {
                "source": similar["source"],
                "score": similar["similarity"],
                "summary": [
                    "Similar Texas gateway saturation detected.",
                    "Early restart previously increased duplicate-charge risk.",
                    "Traffic shift before controlled restart was the successful path.",
                ],
                "prior_call": similar,
                "provider": "moss",
                "integration_mode": memory_mode,
            },
            turn_id="memory",
            mode=memory_mode,
        )
        emit("similar_incident.recalled", similar, turn_id="memory", mode=memory_mode)
        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": (
                    "Yes. I found a similar Texas spike last month. Do you want "
                    "the short version or the full timeline?"
                ),
            },
            turn_id="memory",
            mode="live",
        )
        emit(
            "user.choice",
            {"prompt": "memory_depth", "choice": data.memory_depth_choice},
            turn_id="memory",
            mode="live",
        )
        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": (
                    "The team restarted too early. Queue depth was still high, and "
                    "duplicate-charge risk increased. The successful fix was shifting "
                    "Texas traffic to a secondary gateway before restart."
                ),
            },
            turn_id="memory",
            mode="live",
        )

        emit("knowledge.retrieved", _runbook_payload(), turn_id="mitigation")
        emit("mitigation.proposed", _mitigation_payload(), turn_id="mitigation")
        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": (
                    "My recommendation is check queue depth, shift Texas traffic to the "
                    "secondary gateway, then approve a controlled restart. Should I build "
                    "the mitigation view?"
                ),
            },
            turn_id="mitigation",
            mode="live",
        )
        emit(
            "user.choice",
            {"prompt": "build_mitigation_view", "choice": data.mitigation_choice},
            turn_id="mitigation",
            mode="live",
        )
        emit(
            "scene.state",
            _scene("building", "mitigation_morph", "Rerouting Texas traffic"),
            turn_id="mitigation",
        )

        emit(
            "user.intent",
            {"text": data.risky_action, "language": "en"},
            turn_id="guardrail",
            mode="live",
        )
        blocked = check_dangerous_action(
            current_scope,
            "restart_payment_gateway",
            checks={"queue_depth_checked": False},
            approval_confirmed=False,
        )
        emit(
            "guardrail.checked",
            _dangerous_action_payload(blocked),
            turn_id="guardrail",
            mode="stub",
            correlation_id="restart_payment_gateway",
        )
        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": (
                    "I cannot recommend that yet. Queue depth is unknown, and this exact "
                    "sequence caused duplicate-charge risk last time. I can run the "
                    "queue-depth check or prepare an approval request. Which do you want?"
                ),
            },
            turn_id="guardrail",
            mode="live",
        )

        emit(
            "user.choice",
            {"prompt": "blocked_restart_next_step", "choice": data.approval_choice},
            turn_id="approval",
            mode="live",
        )
        emit("approval.requested", _approval_payload(), turn_id="approval")
        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": (
                    "Approval request prepared for controlled gateway restart after "
                    "queue-depth check. Should I include the prior incident warning?"
                ),
            },
            turn_id="approval",
            mode="live",
        )
        emit(
            "user.choice",
            {"prompt": "include_prior_incident_warning", "choice": data.include_warning_choice},
            turn_id="approval",
            mode="live",
        )

        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": "Want this converted into a clean incident dashboard and report?",
            },
            turn_id="dashboard",
            mode="live",
        )
        emit(
            "user.choice",
            {"prompt": "generate_dashboard", "choice": data.dashboard_choice},
            turn_id="dashboard",
            mode="live",
        )
        emit("dashboard.generated", _dashboard_payload(len(events) + 1), turn_id="dashboard")
        report = _report_payload()
        emit("report.created", report, turn_id="dashboard")
        emit(
            "memory.written",
            self.memory.remember_incident_learning(current_scope, report),
            turn_id="dashboard",
        )
        emit(
            "outcome.created",
            {
                "incident_status": "mitigation_ready",
                "root_cause_hypothesis": report["root_cause_hypothesis"],
                "blocked_actions": ["restart_payment_gateway"],
                "approvals": ["controlled restart approval prepared"],
                "customer_update": report["customer_update"],
                "follow_up": "Add regional load balancing follow-up ticket.",
            },
            turn_id="dashboard",
        )
        emit(
            "audit.saved",
            {
                "store": "local",
                "record_id": "audit_sev1_tx_payments_001",
                "event": "report.created",
                "provider": "aws",
                "integration_mode": "stub",
            },
            turn_id="dashboard",
        )

        return events


def commandos_scope() -> MemoryScope:
    return MemoryScope(
        tenant_id=COMMANDOS_TENANT_ID,
        user_id=COMMANDOS_USER_ID,
        case_id=COMMANDOS_CASE_ID,
    )


def run_commandos_demo() -> list[Event]:
    return CommandOSOrchestrator().run()


def commandos_demo_ndjson() -> str:
    return "\n".join(json.dumps(event.to_dict()) for event in run_commandos_demo())


def _scene(state: str, visual: str, caption: str) -> dict[str, Any]:
    return {"state": state, "visual": visual, "caption": caption}


def _map_payload() -> dict[str, Any]:
    return {
        "region": "Texas",
        "baseline_failure_rate": 0.021,
        "current_failure_rate": 0.184,
        "affected_segment": "premium_customers",
        "hotspots": [
            {
                "city": "Dallas",
                "lat": 32.7767,
                "lng": -96.797,
                "failure_rate": 0.211,
                "failed_transactions": 1284,
                "note": "highest failed-transaction volume",
                "color": "red",
            },
            {
                "city": "Austin",
                "lat": 30.2672,
                "lng": -97.7431,
                "failure_rate": 0.297,
                "failed_transactions": 742,
                "note": "steepest spike",
                "color": "red",
            },
            {
                "city": "Houston",
                "lat": 29.7604,
                "lng": -95.3698,
                "failure_rate": 0.163,
                "failed_transactions": 618,
                "note": "secondary concentration",
                "color": "amber",
            },
        ],
        "frontend": {
            "scene": "failure_map",
            "camera_target": "texas",
            "animation": "raise_map_and_pulse_hotspots",
        },
        "provider": "commandos",
        "integration_mode": "stub",
    }


def _topology_payload() -> dict[str, Any]:
    return {
        "nodes": [
            {"id": "customer_app", "label": "Customer app", "layer": "client", "status": "healthy"},
            {"id": "checkout_api", "label": "Checkout API", "layer": "api", "status": "healthy"},
            {
                "id": "payment_gateway",
                "label": "Payment gateway",
                "layer": "gateway",
                "status": "failing",
            },
            {"id": "processor", "label": "Processor", "layer": "processor", "status": "degraded"},
            {"id": "bank_rails", "label": "Bank rails", "layer": "bank", "status": "healthy"},
        ],
        "edges": [
            {
                "from": "customer_app",
                "to": "checkout_api",
                "status": "healthy",
                "traffic_percent": 100,
            },
            {
                "from": "checkout_api",
                "to": "payment_gateway",
                "status": "healthy",
                "traffic_percent": 100,
            },
            {
                "from": "payment_gateway",
                "to": "processor",
                "status": "failing",
                "traffic_percent": 100,
            },
            {"from": "processor", "to": "bank_rails", "status": "degraded", "traffic_percent": 73},
        ],
        "frontend": {
            "scene": "payment_topology",
            "highlight_node": "payment_gateway",
            "animation": "break_red_streams_between_gateway_and_processor",
        },
    }


def _failure_payload() -> dict[str, Any]:
    return {
        "suspected_failure_point": "payment_gateway_to_processor",
        "hypothesis": "gateway queue saturation",
        "confidence": 0.87,
        "not_likely": ["card_declines", "checkout_validation_failure"],
        "evidence": [
            "Checkout validation success remains normal.",
            "Gateway authorization succeeds before stall.",
            "Processor confirmation latency spikes for Texas traffic.",
        ],
    }


def _runbook_payload() -> dict[str, Any]:
    return {
        "source": "local",
        "score": 0.91,
        "matches": [
            "Do not restart payment gateway before checking queue depth.",
            "If duplicate-charge risk is unresolved, shift traffic before restart.",
            "Controlled restart requires Payments on-call approval.",
        ],
        "document": "atlaspay_payments_outage_runbook.md",
        "provider": "unsiloed",
        "integration_mode": "stub",
    }


def _mitigation_payload() -> dict[str, Any]:
    return {
        "sequence": [
            "check_gateway_queue_depth",
            "shift_texas_traffic_to_secondary_gateway",
            "prepare_controlled_restart_approval",
            "restart_gateway_after_approval",
            "add_regional_load_balancing_followup",
        ],
        "architecture": {
            "add_nodes": [
                {
                    "id": "regional_load_balancer",
                    "label": "Regional load balancer",
                    "layer": "gateway",
                    "status": "proposed",
                },
                {
                    "id": "secondary_gateway",
                    "label": "Secondary gateway",
                    "layer": "gateway",
                    "status": "proposed",
                },
            ],
            "add_edges": [
                {
                    "from": "checkout_api",
                    "to": "regional_load_balancer",
                    "status": "proposed",
                    "traffic_percent": 100,
                },
                {
                    "from": "regional_load_balancer",
                    "to": "secondary_gateway",
                    "status": "proposed",
                    "traffic_percent": 48,
                },
                {
                    "from": "secondary_gateway",
                    "to": "processor",
                    "status": "proposed",
                    "traffic_percent": 48,
                },
            ],
            "reroute": "Texas premium traffic shifts to secondary gateway before restart.",
        },
        "expected_result": (
            "Failed payment stream turns from red to green after queue pressure drops."
        ),
        "frontend": {
            "scene": "mitigation_morph",
            "animation": "spawn_load_balancer_and_secondary_gateway",
        },
    }


def _dangerous_action_payload(decision: GuardrailDecision) -> dict[str, Any]:
    payload = decision.to_event_payload()
    payload.update(
        {
            "risk": ["duplicate charges", "retry storm", "processor replay mismatch"],
            "required_checks": ["gateway_queue_depth", "duplicate_charge_risk"],
            "prior_incident_warning": True,
            "provider": "truefoundry",
            "integration_mode": "stub",
        }
    )
    return payload


def _approval_payload() -> dict[str, Any]:
    return {
        "action": "controlled_payment_gateway_restart",
        "status": "blocked",
        "risk": ["duplicate charges", "retry storm", "customer payment confusion"],
        "required_checks": ["queue depth below threshold", "processor retry rate stable"],
        "approver": "payments_platform_on_call",
        "prior_incident_warning": True,
        "provider": "truefoundry",
        "integration_mode": "stub",
    }


def _dashboard_payload(source_event_count: int) -> dict[str, Any]:
    return {
        "dashboard_id": "dashboard_sev1_tx_payments",
        "sections": [
            "3D failure map",
            "city-level payment failures",
            "payment topology",
            "prior incident match",
            "root-cause hypothesis",
            "recommended mitigation",
            "blocked unsafe action",
            "approval request",
            "customer update draft",
            "postmortem skeleton",
        ],
        "source_event_count": source_event_count,
        "frontend": {"scene": "dashboard", "transition": "fold_3d_scene_into_report"},
    }


def _report_payload() -> dict[str, Any]:
    return {
        "report_id": "report_sev1_tx_payments",
        "title": COMMANDOS_INCIDENT_TITLE,
        "root_cause_hypothesis": (
            "Texas payment failures are likely caused by gateway queue saturation "
            "before processor confirmation."
        ),
        "recommended_mitigation": [
            "Check gateway queue depth.",
            "Shift Texas premium traffic to secondary gateway.",
            "Request controlled restart approval after queue-depth check.",
            "Add regional load balancing follow-up.",
        ],
        "customer_update": (
            "We are investigating elevated payment failures affecting premium customers "
            "in Texas. Payments should not be retried repeatedly while we shift traffic "
            "and complete gateway safety checks."
        ),
        "postmortem_skeleton": [
            "Impact",
            "Timeline",
            "Root cause",
            "What went well",
            "What failed",
            "Action items",
        ],
    }


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in value.lower().replace("_", " ").replace("-", " ").split()
        if token
    }


def _seed_incident_memory() -> dict[str, IncidentMemoryRecord]:
    return {
        "may_2026_texas_gateway_saturation": IncidentMemoryRecord(
            incident_id="may_2026_texas_gateway_saturation",
            title="Texas gateway saturation",
            region="Texas",
            system="payment_gateway",
            tags={"texas", "payments", "payment", "failing", "gateway", "queue", "premium"},
            what_happened="Texas payment failures spiked after gateway queues backed up.",
            bad_action="Gateway restart before queue-depth check increased duplicate-charge risk.",
            successful_action=(
                "Traffic shifted to secondary gateway, then a controlled restart was approved."
            ),
            owner="payments_platform_on_call",
        )
    }


if __name__ == "__main__":
    print(commandos_demo_ndjson())
