"""VoiceBridge shared contract (Python mirror).

The seam between the surface (web + voice transport: Agents 1/2/6/7) and the
brain (Agents 3/4/5/8/9). Hand-mirrored from ``contracts/events.json`` and the
spec. Keep it small; if you add an event/tool, add it in all three mirrors
(events.json, ts, python).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

# ---------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------

EVENT_TOPIC = "voicebridge.events"
COMMANDOS_EVENT_TOPIC = "commandos.events"

# ---------------------------------------------------------------------------
# Demo identifiers (the one controlled insurance claim workflow)
# ---------------------------------------------------------------------------

DEMO_TENANT_ID = "northstar_insurance"
DEMO_TENANT_DISPLAY_NAME = "Northstar Insurance"
DEMO_USER_ID = "ayush_demo"
DEMO_USER_DISPLAY_NAME = "Ayush"
DEMO_CASE_ID = "home_claim_H-48291"
DEMO_CLAIM_NUMBER = "H-48291"
DEMO_LANGUAGES = ("en", "es")

# ---------------------------------------------------------------------------
# CommandOS demo identifiers (the controlled fintech incident workflow)
# ---------------------------------------------------------------------------

COMMANDOS_TENANT_ID = "atlaspay"
COMMANDOS_TENANT_DISPLAY_NAME = "AtlasPay"
COMMANDOS_USER_ID = "ayush_demo"
COMMANDOS_USER_DISPLAY_NAME = "Ayush"
COMMANDOS_CASE_ID = "sev1_tx_payments_2026_06_07"
COMMANDOS_INCIDENT_TITLE = "Texas premium payment failures"

# ---------------------------------------------------------------------------
# Enums (kept as tuples + Literals so both runtime checks and typing work)
# ---------------------------------------------------------------------------

SPONSORS = (
    "livekit",
    "moss",
    "unsiloed",
    "truefoundry",
    "qwen",
    "minimax",
    "elevenlabs",
    "aws",
)
Sponsor = Literal[
    "livekit", "moss", "unsiloed", "truefoundry", "qwen", "minimax", "elevenlabs", "aws"
]

SENSITIVE_FIELDS = (
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
)
SensitiveField = Literal[
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
]

CONSENT_RULES = (
    "ask_every_time",
    "ask_first_then_remember",
    "never_share",
    "auto_share",
)
ConsentRule = Literal[
    "ask_every_time", "ask_first_then_remember", "never_share", "auto_share"
]

CORRECTION_KINDS = ("less_formal", "shorter", "slower", "ask_first_next_time")
CorrectionKind = Literal["less_formal", "shorter", "slower", "ask_first_next_time"]

Speaker = Literal["user", "agent", "insurer"]
IntegrationMode = Literal["live", "stub", "unavailable"]

# ---------------------------------------------------------------------------
# Event types
# ---------------------------------------------------------------------------

EVENT_TYPES = (
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
)
EventType = Literal[
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
]

# ---------------------------------------------------------------------------
# Agent tool surface (the brain implements these)
# ---------------------------------------------------------------------------

AGENT_TOOLS = (
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
)
AgentToolName = Literal[
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
]


@dataclass(slots=True)
class MemoryScope:
    """Scope passed on every MOSS read/write."""

    tenant_id: str = DEMO_TENANT_ID
    user_id: str = DEMO_USER_ID
    case_id: str = DEMO_CASE_ID


# ---------------------------------------------------------------------------
# Event envelope + helpers
# ---------------------------------------------------------------------------

_EVENT_TYPE_SET = frozenset(EVENT_TYPES)


def utc_now_iso() -> str:
    """ISO-8601 UTC timestamp for the envelope."""
    return datetime.now(timezone.utc).isoformat()


def new_event_id() -> str:
    """Stable shape for event IDs; orchestrators can override for replay tests."""
    return f"evt_{uuid4().hex}"


@dataclass(slots=True)
class Event:
    """A VoiceBridge event envelope.

    ``payload`` is an open dict whose shape depends on ``type`` (see the TS
    mirror / spec for the per-type payload fields). Kept open here so the brain
    can populate freely without a class per event.
    """

    type: EventType
    payload: dict[str, Any] = field(default_factory=dict)
    tenant_id: str = DEMO_TENANT_ID
    user_id: str = DEMO_USER_ID
    case_id: str = DEMO_CASE_ID
    timestamp: str = field(default_factory=utc_now_iso)
    event_id: str = field(default_factory=new_event_id)
    sequence: int | None = None
    turn_id: str | None = None
    correlation_id: str | None = None
    mode: IntegrationMode | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def encode(self) -> bytes:
        """Encode to UTF-8 JSON bytes for LiveKit publish_data."""
        return json.dumps(self.to_dict()).encode("utf-8")


def make_event(
    type: EventType,
    payload: dict[str, Any] | None = None,
    scope: MemoryScope | None = None,
    timestamp: str | None = None,
    event_id: str | None = None,
    sequence: int | None = None,
    turn_id: str | None = None,
    correlation_id: str | None = None,
    mode: IntegrationMode | None = None,
) -> Event:
    s = scope or MemoryScope()
    return Event(
        type=type,
        payload=payload or {},
        tenant_id=s.tenant_id,
        user_id=s.user_id,
        case_id=s.case_id,
        timestamp=timestamp or utc_now_iso(),
        event_id=event_id or new_event_id(),
        sequence=sequence,
        turn_id=turn_id,
        correlation_id=correlation_id,
        mode=mode,
    )


def is_event(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and value.get("type") in _EVENT_TYPE_SET
        and isinstance(value.get("tenant_id"), str)
        and isinstance(value.get("user_id"), str)
        and isinstance(value.get("case_id"), str)
        and isinstance(value.get("timestamp"), str)
        and isinstance(value.get("payload"), dict)
    )


def decode_event(data: bytes | str) -> Event | None:
    """Decode + validate bytes/str from a LiveKit data packet. None if invalid."""
    try:
        raw = data.decode("utf-8") if isinstance(data, bytes | bytearray) else data
        parsed = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return None
    if not is_event(parsed):
        return None
    return Event(
        type=parsed["type"],
        payload=parsed["payload"],
        tenant_id=parsed["tenant_id"],
        user_id=parsed["user_id"],
        case_id=parsed["case_id"],
        timestamp=parsed["timestamp"],
        event_id=parsed.get("event_id") or new_event_id(),
        sequence=parsed.get("sequence") if isinstance(parsed.get("sequence"), int) else None,
        turn_id=parsed.get("turn_id") if isinstance(parsed.get("turn_id"), str) else None,
        correlation_id=(
            parsed.get("correlation_id")
            if isinstance(parsed.get("correlation_id"), str)
            else None
        ),
        mode=parsed.get("mode") if parsed.get("mode") in {"live", "stub", "unavailable"} else None,
    )
