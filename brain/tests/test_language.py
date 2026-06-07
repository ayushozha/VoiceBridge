from __future__ import annotations

from dataclasses import dataclass

import pytest

from voicebridge_brain.language import (
    LanguageDetection,
    LanguageSwitchTool,
    detect_language_switch,
    normalize_language_code,
    render_response_language,
)


@pytest.mark.parametrize(
    "utterance",
    [
        "prefiero espanol",
        "puedes hablar en espanol",
        "puedes hablar en espa\u00f1ol",
        "en espanol por favor",
        "Spanish please",
    ],
)
def test_detects_spanish_switch_phrases(utterance: str) -> None:
    result = detect_language_switch("en", utterance)

    assert result["switched"] is True
    assert result["language"] == "es"
    assert result["event_type"] == "language.switched"
    assert result["payload"] == {
        "from": "en",
        "to": "es",
        "detected_by": "local",
        "context_preserved": True,
    }


def test_preserves_scope_for_language_switch_event() -> None:
    scope = {
        "tenant_id": "northstar_insurance",
        "user_id": "ayush_demo",
        "case_id": "home_claim_H-48291",
    }

    result = detect_language_switch("english", "puedes hablar en espanol", scope=scope)

    assert result["scope"] == scope
    assert result["event"] == {
        "type": "language.switched",
        "payload": {
            "from": "en",
            "to": "es",
            "detected_by": "local",
            "context_preserved": True,
        },
        "scope": scope,
    }


def test_same_language_request_does_not_emit_switch_event() -> None:
    result = detect_language_switch("es", "puedes hablar en espanol")

    assert result["switched"] is False
    assert result["language"] == "es"
    assert result["event_type"] is None
    assert result["payload"] is None
    assert "event" not in result


@dataclass(frozen=True)
class FakeQwenAdapter:
    name: str = "qwen"

    def detect_language(self, previous_language: str, utterance: str) -> LanguageDetection:
        return LanguageDetection("es", 0.99, "qwen", "fake_qwen_detection")


def test_qwen_adapter_result_takes_precedence() -> None:
    result = detect_language_switch("en", "ambiguous", adapter=FakeQwenAdapter())

    assert result["switched"] is True
    assert result["detected_by"] == "qwen"
    assert result["confidence"] == 0.99
    assert result["payload"]["detected_by"] == "qwen"


class EmptyAdapter:
    name = "qwen"

    def detect_language(self, previous_language: str, utterance: str) -> None:
        return None


def test_adapter_can_fall_back_to_local_detection() -> None:
    result = detect_language_switch("en", "prefiero espanol", adapter=EmptyAdapter())

    assert result["switched"] is True
    assert result["detected_by"] == "local"


def test_language_switch_tool_matches_orchestrator_signature() -> None:
    scope = {
        "tenant_id": "northstar_insurance",
        "user_id": "ayush_demo",
        "case_id": "home_claim_H-48291",
    }

    decision = LanguageSwitchTool().detect_language_switch(
        scope,
        "en",
        "prefiero espanol",
    )

    assert decision.switched is True
    assert decision.language == "es"
    assert decision.context_preserved is True
    assert decision.scope == scope
    assert decision.payload == {
        "from": "en",
        "to": "es",
        "detected_by": "local",
        "context_preserved": True,
    }


def test_render_response_language_uses_spanish_template_and_context() -> None:
    response = render_response_language(
        "claim_context",
        {"claim_number": "H-48291"},
        "espanol",
    )

    assert response == "Seguimos trabajando en el reclamo H-48291."


def test_normalize_language_code_handles_accents_and_aliases() -> None:
    assert normalize_language_code("espa\u00f1ol") == "es"
    assert normalize_language_code("ingl\u00e9s") == "en"
