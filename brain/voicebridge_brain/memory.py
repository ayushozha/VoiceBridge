"""MOSS-shaped communication memory adapter for the VoiceBridge brain.

The demo runs without live MOSS credentials, so the default adapter is a
deterministic local fallback seeded with Ayush's Northstar claim context. The
public functions keep the same tool shape that the orchestrator can swap to a
live MOSS-backed implementation later.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Literal

from voicebridge_contract import (
    DEMO_CASE_ID,
    DEMO_CLAIM_NUMBER,
    DEMO_TENANT_ID,
    DEMO_USER_ID,
    MemoryScope,
)

MemorySource = Literal["moss", "local"]


@dataclass(frozen=True, slots=True)
class MemoryRecall:
    """Payload-compatible recall result for ``memory.recalled`` events."""

    source: MemorySource
    summary: list[str]
    prior_call: dict[str, Any] = field(default_factory=dict)
    score: float | None = None


@dataclass(slots=True)
class _MemoryRecord:
    profile: dict[str, Any]
    call_events: list[dict[str, Any]] = field(default_factory=list)


class MOSSMemoryAdapter:
    """Small local fallback behind the Agent 4 MOSS memory tool surface."""

    def __init__(self, source: MemorySource = "local") -> None:
        self.source = source
        self._records = _seeded_records()

    def recall_customer_context(self, scope: MemoryScope) -> MemoryRecall:
        """Retrieve scoped communication memory for the current caller/case."""
        record = self._records.get(_scope_key(scope))
        if record is None:
            return MemoryRecall(
                source=self.source,
                score=0.0,
                summary=["No prior customer memory found for this tenant/user/case scope."],
                prior_call={"call_history": [], "recent_events": []},
            )

        profile = deepcopy(record.profile)
        profile["recent_events"] = deepcopy(record.call_events[-5:])
        return MemoryRecall(
            source=self.source,
            score=0.94,
            summary=_summary_for(profile),
            prior_call=profile,
        )

    def remember_call_event(
        self,
        scope: MemoryScope,
        event_type: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Write a structured event into scoped communication memory.

        Returns a ``memory.written`` payload: ``source``, ``event``, ``before``,
        and ``after``. Keeping this as a dict lets the orchestrator emit it
        directly through the shared event contract.
        """
        if not event_type:
            raise ValueError("event_type must be a non-empty string")
        if not isinstance(payload, dict):
            raise TypeError("payload must be a dict")

        record = self._records.setdefault(_scope_key(scope), _empty_record(scope))
        event_payload = deepcopy(payload)
        before = _write_snapshot(record)
        profile_patch = _apply_event(record, event_type, event_payload)

        memory_event = {
            "event": event_type,
            "payload": event_payload,
        }
        record.call_events.append(memory_event)

        after = _write_snapshot(record)
        after.update(
            {
                "tenant_id": scope.tenant_id,
                "user_id": scope.user_id,
                "case_id": scope.case_id,
                "latest_event": deepcopy(memory_event),
                "profile_patch": profile_patch,
            }
        )
        return {
            "source": self.source,
            "event": event_type,
            "before": before,
            "after": after,
        }


def recall_customer_context(scope: MemoryScope) -> MemoryRecall:
    """Tool entrypoint used by the orchestrator for MOSS customer recall."""
    return _DEFAULT_ADAPTER.recall_customer_context(scope)


def remember_call_event(
    scope: MemoryScope,
    event_type: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Tool entrypoint used by the orchestrator for scoped memory writes."""
    return _DEFAULT_ADAPTER.remember_call_event(scope, event_type, payload)


def _scope_key(scope: MemoryScope) -> tuple[str, str, str]:
    return (scope.tenant_id, scope.user_id, scope.case_id)


def _seeded_records() -> dict[tuple[str, str, str], _MemoryRecord]:
    return {
        (DEMO_TENANT_ID, DEMO_USER_ID, DEMO_CASE_ID): _MemoryRecord(
            profile={
                "profile_id": f"user_{DEMO_USER_ID}",
                "owner_type": "policyholder",
                "style_preferences": {
                    "tone": "short_direct",
                    "formality": "low",
                    "pace": "slow",
                    "verbosity": "concise",
                },
                "language_preferences": {
                    "default": "en",
                    "supported": ["en", "es"],
                    "allow_mid_call_switch": True,
                },
                "consent_rules": [
                    {"field": "claim_number", "rule": "ask_every_time"},
                    {"field": "policy_id", "rule": "ask_every_time"},
                    {"field": "address", "rule": "ask_every_time"},
                    {"field": "date_of_loss", "rule": "ask_every_time"},
                    {"field": "phone_number", "rule": "ask_every_time"},
                ],
                "corrections": [
                    {
                        "scope": "insurance_claim_follow_up",
                        "instruction": "Use shorter, calmer wording.",
                        "source": "user_tap",
                    }
                ],
                "consent_events": [],
                "call_history": [
                    {
                        "organization": "Northstar Insurance",
                        "topic": DEMO_CASE_ID,
                        "claim_number": DEMO_CLAIM_NUMBER,
                        "outcome": "claim_pending_documents_needed",
                        "missing_documents": ["damage_photos", "repair_estimate"],
                        "shared_sensitive_fields": ["claim_number"],
                        "last_language": "en",
                    }
                ],
            }
        )
    }


def _empty_record(scope: MemoryScope) -> _MemoryRecord:
    return _MemoryRecord(
        profile={
            "profile_id": f"user_{scope.user_id}",
            "owner_type": "policyholder",
            "style_preferences": {},
            "language_preferences": {},
            "consent_rules": [],
            "corrections": [],
            "consent_events": [],
            "call_history": [],
        }
    )


def _summary_for(profile: dict[str, Any]) -> list[str]:
    style = profile.get("style_preferences", {})
    language = profile.get("language_preferences", {})
    history = profile.get("call_history", [])
    latest = history[-1] if history else {}
    return [
        "Ayush prefers short, direct wording with slow pacing and confirmation pauses.",
        (
            f"Claim {latest.get('claim_number', DEMO_CLAIM_NUMBER)} is pending; "
            "Northstar requested damage photos and repair estimate."
        ),
        "Ask before sharing claim number, policy ID, address, date of loss, or phone number.",
        (
            f"Language memory: default {language.get('default', 'en')}, "
            f"supported {', '.join(language.get('supported', ['en']))}."
        ),
        (
            f"Style memory: tone={style.get('tone', 'unknown')}, "
            f"verbosity={style.get('verbosity', 'unknown')}."
        ),
    ]


def _write_snapshot(record: _MemoryRecord) -> dict[str, Any]:
    language = record.profile.get("language_preferences", {})
    history = record.profile.get("call_history", [])
    latest_history = history[-1] if history else {}
    return {
        "event_count": len(record.call_events),
        "last_language": language.get("last") or latest_history.get("last_language"),
        "call_history_count": len(history),
        "correction_count": len(record.profile.get("corrections", [])),
        "consent_event_count": len(record.profile.get("consent_events", [])),
    }


def _apply_event(
    record: _MemoryRecord,
    event_type: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    if event_type == "language.switched":
        return _remember_language_switch(record, payload)
    if event_type in {"correction", "user.correction"}:
        return _remember_correction(record, payload)
    if event_type in {"consent.approved", "consent.denied"}:
        return _remember_consent(record, event_type, payload)
    if event_type in {"outcome", "outcome.created"}:
        return _remember_outcome(record, payload)
    return {"event_recorded": event_type}


def _remember_language_switch(record: _MemoryRecord, payload: dict[str, Any]) -> dict[str, Any]:
    target_language = payload.get("to") or payload.get("language")
    if not isinstance(target_language, str):
        return {"language_preferences": "unchanged"}

    language_preferences = record.profile.setdefault("language_preferences", {})
    language_preferences["last"] = target_language
    supported = language_preferences.setdefault("supported", ["en"])
    if target_language not in supported:
        supported.append(target_language)
    return {"language_preferences": deepcopy(language_preferences)}


def _remember_correction(record: _MemoryRecord, payload: dict[str, Any]) -> dict[str, Any]:
    instruction = (
        payload.get("preference_learned")
        or payload.get("instruction")
        or payload.get("text")
        or payload.get("kind")
    )
    correction = {
        "scope": payload.get("scope", "future_calls"),
        "instruction": str(instruction) if instruction else "User requested a future style change.",
        "source": payload.get("source", "call_event"),
    }
    record.profile.setdefault("corrections", []).append(correction)
    return {"corrections": [deepcopy(correction)]}


def _remember_consent(
    record: _MemoryRecord,
    event_type: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    consent_event = {
        "event": event_type,
        "field": payload.get("field"),
        "shared_value": payload.get("shared_value"),
    }
    record.profile.setdefault("consent_events", []).append(consent_event)
    return {"consent_events": [deepcopy(consent_event)]}


def _remember_outcome(record: _MemoryRecord, payload: dict[str, Any]) -> dict[str, Any]:
    language = record.profile.get("language_preferences", {})
    outcome = {
        "organization": payload.get("organization", "Northstar Insurance"),
        "topic": payload.get("case_id") or payload.get("topic") or DEMO_CASE_ID,
        "claim_number": payload.get("claim_number", DEMO_CLAIM_NUMBER),
        "outcome": payload.get("claim_status") or payload.get("outcome"),
        "missing_documents": payload.get("missing_documents", []),
        "shared_sensitive_fields": payload.get("sensitive_info_shared", []),
        "last_language": language.get("last") or "en",
    }
    record.profile.setdefault("call_history", []).append(outcome)
    return {"call_history": [deepcopy(outcome)]}


_DEFAULT_ADAPTER = MOSSMemoryAdapter()
