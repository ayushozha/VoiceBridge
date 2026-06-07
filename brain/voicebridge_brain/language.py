"""Agent 9 multilingual language-switch helpers.

The brain owns conversation state, so this module keeps language switching
deterministic and scope-preserving even when Qwen/DashScope is not configured.
"""

from __future__ import annotations

import os
import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

DEFAULT_LANGUAGE = "en"
LANGUAGE_SWITCH_EVENT = "language.switched"
SUPPORTED_LANGUAGES = frozenset({"en", "es"})

DetectionProvider = Literal["qwen", "local"]


@dataclass(frozen=True, slots=True)
class LanguageDetection:
    """Normalized model/local language detection result."""

    language: str
    confidence: float
    detected_by: DetectionProvider
    reason: str


@dataclass(frozen=True, slots=True)
class LanguageSwitchDecision:
    """Attribute-style decision object for orchestrator tool injection."""

    previous_language: str
    language: str
    switched: bool
    detected_by: DetectionProvider
    context_preserved: bool = True
    confidence: float = 0.0
    reason: str = ""
    payload: dict[str, Any] | None = None
    scope: dict[str, str] = field(default_factory=dict)


class LanguageModelAdapter(Protocol):
    """Adapter interface for Qwen or another multilingual model."""

    name: str

    def detect_language(
        self,
        previous_language: str,
        utterance: str,
    ) -> LanguageDetection | Mapping[str, Any] | None:
        """Return the detected target language, or None to use local fallback."""


@dataclass(frozen=True, slots=True)
class QwenLanguageAdapter:
    """Qwen/DashScope adapter placeholder for live integration.

    The live orchestrator can inject an adapter that implements
    ``LanguageModelAdapter``. This default adapter only advertises whether Qwen
    appears configured, then returns None so the deterministic fallback handles
    demo traffic without credentials or network calls.
    """

    base_url: str | None = None
    api_key: str | None = None
    model: str = "qwen-plus"
    name: str = "qwen"

    @classmethod
    def from_env(cls) -> QwenLanguageAdapter:
        return cls(
            base_url=_env_value("QWEN_BASE_URL"),
            api_key=_env_value("DASHSCOPE_API_KEY"),
            model=os.getenv("QWEN_MODEL", "qwen-plus"),
        )

    @property
    def is_configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    def detect_language(
        self,
        previous_language: str,
        utterance: str,
    ) -> LanguageDetection | None:
        return None


class LanguageSwitchTool:
    """Orchestrator-compatible Agent 9 language tool."""

    def __init__(self, adapter: LanguageModelAdapter | None = None) -> None:
        self.adapter = adapter

    def detect_language_switch(
        self,
        scope: Mapping[str, Any] | object | None,
        previous_language: str | None,
        utterance: str,
    ) -> LanguageSwitchDecision:
        result = detect_language_switch(
            previous_language,
            utterance,
            scope=scope,
            adapter=self.adapter,
        )
        payload = result["payload"]
        return LanguageSwitchDecision(
            previous_language=result["previous_language"],
            language=result["language"],
            switched=result["switched"],
            detected_by=result["detected_by"],
            context_preserved=bool(payload["context_preserved"]) if payload else True,
            confidence=result["confidence"],
            reason=result["reason"],
            payload=payload,
            scope=result["scope"],
        )


_SPANISH_SWITCH_PATTERNS = (
    re.compile(
        r"\b(prefiero|quiero|quisiera|puedes|podrias|puede|habla|hablar|"
        r"hablemos|continua|continuemos|cambia|cambiar|mejor|respondeme|responde)"
        r"\b.{0,40}\b(espanol|castellano)\b"
    ),
    re.compile(r"\b(en|a)\s+(espanol|castellano)\b"),
    re.compile(r"\b(espanol|castellano)\s+por\s+favor\b"),
    re.compile(r"\bspanish\s+(please|por\s+favor)?\b"),
    re.compile(r"\b(speak|talk|continue|respond|answer)\b.{0,30}\bspanish\b"),
)

_ENGLISH_SWITCH_PATTERNS = (
    re.compile(
        r"\b(prefiero|quiero|quisiera|puedes|podrias|puede|habla|hablar|"
        r"hablemos|continua|continuemos|cambia|cambiar|mejor|respondeme|responde)"
        r"\b.{0,40}\b(ingles|english)\b"
    ),
    re.compile(r"\b(en|a)\s+(ingles|english)\b"),
    re.compile(r"\b(ingles|english)\s+por\s+favor\b"),
    re.compile(r"\benglish\s+please\b"),
    re.compile(r"\b(speak|talk|continue|respond|answer)\b.{0,30}\benglish\b"),
)

_SPANISH_CUE_WORDS = frozenset(
    {
        "puedes",
        "podrias",
        "hablar",
        "prefiero",
        "quiero",
        "quisiera",
        "espanol",
        "castellano",
        "reclamo",
        "aseguradora",
        "por",
        "favor",
    }
)

_ENGLISH_CUE_WORDS = frozenset(
    {
        "speak",
        "talk",
        "continue",
        "english",
        "please",
        "claim",
        "insurance",
        "insurer",
    }
)

_RESPONSE_TEMPLATES = {
    "language_switched": {
        "en": "I can continue in English while keeping the same claim context.",
        "es": "Claro, puedo seguir en espa\u00f1ol y mantener el mismo contexto de su reclamo.",
    },
    "claim_context": {
        "en": "We are still working on claim {claim_number}.",
        "es": "Seguimos trabajando en el reclamo {claim_number}.",
    },
    "missing_documents": {
        "en": "The insurer still needs {missing_documents}.",
        "es": "La aseguradora todavia necesita {missing_documents}.",
    },
    "consent_check": {
        "en": "I will ask before sharing sensitive information.",
        "es": "Le preguntare antes de compartir informacion sensible.",
    },
}


def detect_language_switch(
    previous_language: str | None,
    utterance: str,
    *,
    scope: Mapping[str, Any] | object | None = None,
    adapter: LanguageModelAdapter | None = None,
) -> dict[str, Any]:
    """Detect a mid-call language switch and return event-ready metadata.

    The return shape is intentionally JSON-friendly for the orchestrator:
    ``payload`` is the exact ``language.switched`` payload when a switch occurs,
    while ``scope`` carries the original tenant/user/case identifiers.
    """

    previous = normalize_language_code(previous_language)
    scope_payload = _normalize_scope(scope)
    detection = _detect_with_adapter(adapter, previous, utterance) or _detect_language_locally(
        previous,
        utterance,
    )
    target_language = normalize_language_code(detection.language)
    switched = target_language != previous
    payload = (
        {
            "from": previous,
            "to": target_language,
            "detected_by": detection.detected_by,
            "context_preserved": True,
        }
        if switched
        else None
    )

    result: dict[str, Any] = {
        "previous_language": previous,
        "language": target_language,
        "switched": switched,
        "detected_by": detection.detected_by,
        "confidence": detection.confidence,
        "reason": detection.reason,
        "event_type": LANGUAGE_SWITCH_EVENT if switched else None,
        "payload": payload,
        "scope": scope_payload,
    }
    if switched:
        result["event"] = {
            "type": LANGUAGE_SWITCH_EVENT,
            "payload": payload,
            "scope": scope_payload,
        }
    return result


def render_response_language(
    text_key: str,
    context: Mapping[str, Any] | None = None,
    language: str | None = DEFAULT_LANGUAGE,
) -> str:
    """Render a small user-side response in the requested language."""

    lang = normalize_language_code(language)
    values = _TemplateContext(context or {})
    template_by_language = _RESPONSE_TEMPLATES.get(text_key)
    if template_by_language:
        template = template_by_language.get(lang) or template_by_language[DEFAULT_LANGUAGE]
    else:
        template = str((context or {}).get(text_key, text_key))
    return template.format_map(values)


def normalize_language_code(language: str | None) -> str:
    """Normalize common language labels to contract language codes."""

    normalized = _normalize_text(language or DEFAULT_LANGUAGE)
    if normalized in {"en", "eng", "english", "ingles", "en us", "en uk"}:
        return "en"
    if normalized in {"es", "spa", "spanish", "espanol", "castellano", "es es"}:
        return "es"
    return normalized if normalized in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


def default_language_adapter() -> QwenLanguageAdapter | None:
    """Return the default Qwen adapter only when credentials look present."""

    adapter = QwenLanguageAdapter.from_env()
    return adapter if adapter.is_configured else None


def _detect_with_adapter(
    adapter: LanguageModelAdapter | None,
    previous_language: str,
    utterance: str,
) -> LanguageDetection | None:
    selected_adapter = adapter if adapter is not None else default_language_adapter()
    if selected_adapter is None:
        return None
    try:
        raw_detection = selected_adapter.detect_language(previous_language, utterance)
    except Exception:
        return None
    detection = _coerce_detection(raw_detection, "qwen")
    if detection is None or detection.language not in SUPPORTED_LANGUAGES:
        return None
    return detection


def _detect_language_locally(previous_language: str, utterance: str) -> LanguageDetection:
    normalized = _normalize_text(utterance)
    if _matches_any(normalized, _SPANISH_SWITCH_PATTERNS):
        return LanguageDetection("es", 0.94, "local", "spanish_switch_phrase")
    if _matches_any(normalized, _ENGLISH_SWITCH_PATTERNS):
        return LanguageDetection("en", 0.94, "local", "english_switch_phrase")

    words = set(normalized.split())
    spanish_hits = len(words & _SPANISH_CUE_WORDS)
    english_hits = len(words & _ENGLISH_CUE_WORDS)
    if previous_language == "en" and spanish_hits >= 2:
        return LanguageDetection("es", 0.72, "local", "spanish_cue_words")
    if previous_language == "es" and english_hits >= 2:
        return LanguageDetection("en", 0.72, "local", "english_cue_words")
    return LanguageDetection(previous_language, 0.5, "local", "no_switch_detected")


def _coerce_detection(
    detection: LanguageDetection | Mapping[str, Any] | None,
    default_provider: DetectionProvider,
) -> LanguageDetection | None:
    if detection is None:
        return None
    if isinstance(detection, LanguageDetection):
        return LanguageDetection(
            normalize_language_code(detection.language),
            detection.confidence,
            detection.detected_by,
            detection.reason,
        )
    language = detection.get("language") or detection.get("to")
    if language is None:
        return None
    provider = detection.get("detected_by", default_provider)
    if provider not in {"qwen", "local"}:
        provider = default_provider
    return LanguageDetection(
        normalize_language_code(str(language)),
        float(detection.get("confidence", 1.0)),
        provider,  # type: ignore[arg-type]
        str(detection.get("reason", f"{provider}_adapter")),
    )


def _normalize_scope(scope: Mapping[str, Any] | object | None) -> dict[str, str]:
    if scope is None:
        return {}
    if isinstance(scope, Mapping):
        return {
            key: str(scope[key])
            for key in ("tenant_id", "user_id", "case_id")
            if scope.get(key) is not None
        }
    return {
        key: str(value)
        for key in ("tenant_id", "user_id", "case_id")
        if (value := getattr(scope, key, None)) is not None
    }


def _matches_any(text: str, patterns: tuple[re.Pattern[str], ...]) -> bool:
    return any(pattern.search(text) for pattern in patterns)


def _normalize_text(text: str) -> str:
    without_accents = (
        unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    )
    lowered = without_accents.casefold()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", lowered)).strip()


def _env_value(name: str) -> str | None:
    value = os.getenv(name)
    if not value:
        return None
    value = value.strip()
    if not value or (value.startswith("<") and value.endswith(">")):
        return None
    return value


class _TemplateContext(dict[str, Any]):
    def __missing__(self, key: str) -> str:
        if key == "claim_number":
            return "your claim"
        if key == "missing_documents":
            return "the requested documents"
        return "{" + key + "}"


__all__ = [
    "DEFAULT_LANGUAGE",
    "LANGUAGE_SWITCH_EVENT",
    "LanguageDetection",
    "LanguageModelAdapter",
    "LanguageSwitchDecision",
    "LanguageSwitchTool",
    "QwenLanguageAdapter",
    "default_language_adapter",
    "detect_language_switch",
    "normalize_language_code",
    "render_response_language",
]
