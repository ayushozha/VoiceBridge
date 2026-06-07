"""Deterministic VoiceBridge demo orchestration.

Agent 3 owns the call brain: it turns user/insurer turns into contract events
and calls adapter-shaped tools for memory, knowledge, guardrails, and language.
The local adapters here keep the text-mode demo deterministic while Agents 4,
5, 8, and 9 fill in production-shaped modules behind the same boundary.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from voicebridge_contract import DEMO_CLAIM_NUMBER, Event, MemoryScope, make_event

from voicebridge_brain.guardrails import GuardrailDecision, LocalTrueFoundryGuardrailAdapter
from voicebridge_brain.knowledge import BusinessKnowledgeAdapter, KnowledgeMatch
from voicebridge_brain.language import (
    LanguageSwitchDecision,
    LanguageSwitchTool,
    render_response_language,
)
from voicebridge_brain.memory import MemoryRecall, MOSSMemoryAdapter


@dataclass(frozen=True, slots=True)
class ConversationInputs:
    """Scripted turns for the hackathon insurance demo."""

    opening_intent: str = "I am calling about my roof leak claim."
    insurer_request: str = "Can you provide the claim number?"
    consent_choice: str = "yes"
    language_switch_utterance: str = "Prefiero hablar en espanol."
    correction: str = "Please be shorter next time."


class MemoryTool(Protocol):
    def recall_customer_context(self, scope: MemoryScope) -> MemoryRecall: ...

    def remember_call_event(
        self,
        scope: MemoryScope,
        event_type: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]: ...


class KnowledgeTool(Protocol):
    def search_business_knowledge(self, scope: MemoryScope, query: str) -> KnowledgeMatch: ...


class GuardrailTool(Protocol):
    def check_sensitive_disclosure(
        self,
        scope: MemoryScope,
        field: str,
        proposed_value: str,
        consent_approved: bool,
    ) -> GuardrailDecision: ...


class LanguageTool(Protocol):
    def detect_language_switch(
        self,
        scope: MemoryScope,
        previous_language: str,
        utterance: str,
    ) -> LanguageSwitchDecision: ...


class DemoOrchestrator:
    """Emit the controlled VoiceBridge demo event stream."""

    def __init__(
        self,
        memory: MemoryTool | None = None,
        knowledge: KnowledgeTool | None = None,
        guardrails: GuardrailTool | None = None,
        language: LanguageTool | None = None,
    ) -> None:
        self.memory = memory or MOSSMemoryAdapter()
        self.knowledge = knowledge or BusinessKnowledgeAdapter()
        self.guardrails = guardrails or LocalTrueFoundryGuardrailAdapter()
        self.language = language or LanguageSwitchTool()

    def run(
        self,
        inputs: ConversationInputs | None = None,
        scope: MemoryScope | None = None,
    ) -> list[Event]:
        data = inputs or ConversationInputs()
        current_scope = scope or MemoryScope()
        events: list[Event] = []

        def emit(type: str, payload: dict[str, Any]) -> None:
            events.append(make_event(type, payload, current_scope))  # type: ignore[arg-type]

        emit("user.intent", {"text": data.opening_intent, "language": "en"})

        recall = self.memory.recall_customer_context(current_scope)
        emit(
            "memory.recalled",
            {
                "source": recall.source,
                "score": recall.score,
                "summary": recall.summary,
                "prior_call": recall.prior_call,
            },
        )

        knowledge = self.knowledge.search_business_knowledge(current_scope, data.opening_intent)
        emit(
            "knowledge.retrieved",
            {
                "source": knowledge.source,
                "score": knowledge.score,
                "matches": knowledge.matches,
                "document": knowledge.document,
            },
        )

        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": "I found your Northstar home claim and the upload requirements.",
            },
        )
        emit(
            "insurer.utterance",
            {"speaker": "insurer", "language": "en", "text": data.insurer_request},
        )

        blocked = self.guardrails.check_sensitive_disclosure(
            current_scope,
            "claim_number",
            DEMO_CLAIM_NUMBER,
            False,
        )
        emit("guardrail.checked", _guardrail_payload(blocked))
        emit(
            "consent.requested",
            {
                "field": "claim_number",
                "proposed_disclosure": f"the claim number is {DEMO_CLAIM_NUMBER}",
                "rule": "ask_every_time",
                "options": ["Approve once", "Deny", "Use alternate wording"],
            },
        )
        emit("user.choice", {"prompt": "share_claim_number", "choice": data.consent_choice})
        emit("consent.approved", {"field": "claim_number", "shared_value": DEMO_CLAIM_NUMBER})

        allowed = self.guardrails.check_sensitive_disclosure(
            current_scope,
            "claim_number",
            DEMO_CLAIM_NUMBER,
            True,
        )
        emit("guardrail.checked", _guardrail_payload(allowed))
        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": "en",
                "text": f"Ayush approved sharing claim number {DEMO_CLAIM_NUMBER}.",
            },
        )

        language = self.language.detect_language_switch(
            current_scope,
            "en",
            data.language_switch_utterance,
        )
        emit("user.intent", {"text": data.language_switch_utterance, "language": language.language})
        if language.switched:
            emit(
                "language.switched",
                {
                    "from": language.previous_language,
                    "to": language.language,
                    "detected_by": language.detected_by,
                    "context_preserved": language.context_preserved,
                },
            )
        emit(
            "agent.utterance",
            {
                "speaker": "agent",
                "language": language.language,
                "text": render_response_language(
                    "claim_context",
                    {"claim_number": DEMO_CLAIM_NUMBER},
                    language.language,
                ),
            },
        )

        memory_write = self.memory.remember_call_event(
            current_scope,
            "language.switched",
            {"from": "en", "to": language.language, "preference": "spanish_supported"},
        )
        emit("memory.written", memory_write)

        emit("user.correction", {"kind": "shorter", "scope": "future_calls"})
        preference_write = self.memory.remember_call_event(
            current_scope,
            "correction",
            {"preference_learned": data.correction},
        )
        emit("memory.written", preference_write)

        emit(
            "outcome.created",
            {
                "claim_status": "documents_requested",
                "claim_number": DEMO_CLAIM_NUMBER,
                "missing_documents": [
                    "roof photos",
                    "contractor estimate",
                    "proof of temporary repair",
                ],
                "deadline": "10 business days from notice",
                "sensitive_info_shared": ["claim_number"],
                "approvals": ["claim_number shared once"],
                "language_switch": {"from": "en", "to": language.language},
                "preference_learned": "shorter future explanations",
                "follow_up": "Upload documents through Northstar portal.",
            },
        )
        emit(
            "audit.saved",
            {
                "store": "local",
                "record_id": "demo-audit-H-48291",
                "event": "outcome.created",
            },
        )

        return events


def _guardrail_payload(decision: GuardrailDecision) -> dict[str, Any]:
    if hasattr(decision, "to_event_payload"):
        return decision.to_event_payload()
    return {
        "action": decision.action,
        "decision": decision.decision,
        "reason": decision.reason,
        "enforced_by": decision.enforced_by,
    }


def run_scripted_demo() -> list[Event]:
    """Convenience entrypoint for tests, CLI hooks, and mock UI streams."""
    return DemoOrchestrator().run()
