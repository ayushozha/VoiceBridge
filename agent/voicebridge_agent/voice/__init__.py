"""VoiceBridge voice path (Agent 2 — Low-Latency Voice Lead).

Public surface:

- ``select_tts(config)`` -> ``VoiceSelection``: picks the fastest *reliable*
  available provider (ElevenLabs first, then MiniMax, then the browser
  last-resort marker) and records the full preference order for the runtime
  trace. Agent 1 calls ``selection.livekit_tts()`` to feed ``AgentSession``, and
  reads ``selection.provider`` to emit ``voice.spoken`` with the right sponsor.
- ``TTSResult`` / ``TTSAdapter`` / ``VoiceSelection``: the shared contract.
- Concrete adapters: ``ElevenLabsAdapter`` (primary), ``MiniMaxAdapter``
  (sponsor), ``BrowserFallbackAdapter`` (last resort).

The module is import-safe without the LiveKit SDK; the SDK is imported lazily
only inside ``livekit_tts``.
"""

from __future__ import annotations

from voicebridge_agent.config import Config

from .base import (
    DEFAULT_SAMPLE_RATE,
    NUM_CHANNELS,
    Provider,
    TTSAdapter,
    TTSResult,
    VoiceSelection,
)
from .browser import BrowserFallbackAdapter
from .elevenlabs import ElevenLabsAdapter
from .minimax import MiniMaxAdapter


def build_adapters(config: Config) -> list[TTSAdapter]:
    """Adapters in preference order: fastest reliable first, marker last.

    ElevenLabs is the primary low-latency multilingual voice and the most
    reliable for the demo. MiniMax is the sponsor path. The browser marker is
    the always-available floor so a call never has *no* voice.
    """
    return [
        ElevenLabsAdapter(config),
        MiniMaxAdapter(config),
        BrowserFallbackAdapter(),
    ]


def select_tts(config: Config) -> VoiceSelection:
    """Choose the fastest reliable available TTS provider.

    Returns a ``VoiceSelection`` exposing the chosen provider name (so the trace
    can emit ``voice.spoken`` with the right provider) and the considered order
    (so the runbook can explain the fallback chain). The browser marker is always
    available, so this never raises.
    """
    adapters = build_adapters(config)
    considered: list[tuple[Provider, bool]] = []
    chosen: TTSAdapter | None = None
    for adapter in adapters:
        ok = adapter.available()
        considered.append((adapter.name, ok))
        if ok and chosen is None:
            chosen = adapter
    # build_adapters always ends with the always-available browser marker.
    assert chosen is not None  # noqa: S101 - invariant guaranteed by build_adapters
    return VoiceSelection(adapter=chosen, considered=considered)


# ---------------------------------------------------------------------------
# Standalone demo path (mock-first): synthesize the agent's demo lines and
# report which provider + latency each produced, matching the spec demo flow.
# This lets the voice slice be exercised end-to-end without the brain wired.
# ---------------------------------------------------------------------------

# The agent's spoken lines from spec.md § Demo Script (insurer-facing English +
# the mid-call Spanish user-facing line). Each is (text, language).
DEMO_AGENT_LINES: list[tuple[str, str]] = [
    ("Yes, this is about the same home claim from yesterday.", "en"),
    ("Yes, the claim number is H-48291.", "en"),
    ("Where should the photos and repair estimate be uploaded, and is there a deadline?", "en"),
    (
        "Necesitan las fotos y el presupuesto antes del viernes. "
        "El enlace esta en el portal de reclamos.",
        "es",
    ),
    (
        "Thank you. Please note that the claimant will upload the photos and "
        "repair estimate before Friday.",
        "en",
    ),
]


async def run_demo(config: Config) -> list[TTSResult]:
    """Synthesize the demo agent lines with the selected provider; return results.

    Each ``TTSResult`` carries the provider chosen and the measured final-text ->
    first-audio-byte latency, so the caller can print a runtime trace identical
    in shape to the ``voice.spoken`` events Agent 1 emits.
    """
    selection = select_tts(config)
    results: list[TTSResult] = []
    for text, language in DEMO_AGENT_LINES:
        results.append(await selection.synthesize(text, language=language))
    return results


__all__ = [
    "DEFAULT_SAMPLE_RATE",
    "DEMO_AGENT_LINES",
    "NUM_CHANNELS",
    "Provider",
    "TTSAdapter",
    "TTSResult",
    "VoiceSelection",
    "BrowserFallbackAdapter",
    "ElevenLabsAdapter",
    "MiniMaxAdapter",
    "build_adapters",
    "run_demo",
    "select_tts",
]
