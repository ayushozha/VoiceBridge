"""TTS adapter interface (Agent 2 — Low-Latency Voice Lead).

A thin seam over speech providers so the agent can pick the fastest reliable
voice at runtime and log latency uniformly.

Two surfaces, one per consumer:

1. ``TTSAdapter.livekit_tts()`` returns a ``livekit.agents.tts.TTS`` instance to
   drop into ``AgentSession(tts=...)``. This is what Agent 1 wires into the
   pipeline. ElevenLabs uses the first-party LiveKit plugin; MiniMax is our own
   ``tts.TTS`` subclass (the first-party MiniMax plugin pins an old core, so we
   do not use it).
2. ``TTSAdapter.synthesize(text, language)`` is a provider-agnostic one-shot
   that returns a ``TTSResult`` carrying the audio bytes + measured latency
   (final text -> first audio byte). Used for the standalone latency demo and
   so the trace can emit ``voice.spoken`` with the right provider + latency_ms.

Both paths share the same provider identity + latency contract, so whichever
voice ``select_tts`` picks, the runtime trace stays honest.

The whole module is import-safe without the LiveKit SDK installed (the SDK is
imported lazily inside ``livekit_tts``), so ``import voicebridge_agent.voice``
and the unit tests run before ``uv sync``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:  # avoid importing the heavy SDK at module load / in tests
    from livekit.agents import tts as lk_tts

# Provider identifiers that line up with the contract's VoiceSpokenPayload.provider
# (Sponsor "minimax" | "elevenlabs" | "browser"). Keep these strings exact.
Provider = str  # "elevenlabs" | "minimax" | "browser"

# Default PCM container the agent pipeline consumes. 24 kHz mono is a good
# latency/quality tradeoff for speech and matches LiveKit's expected frame rate.
DEFAULT_SAMPLE_RATE = 24000
NUM_CHANNELS = 1


@dataclass(slots=True)
class TTSResult:
    """Outcome of a one-shot synthesis, for the voice.spoken event + latency logging.

    ``audio`` holds the concatenated raw bytes (PCM or encoded, per ``mime_type``)
    when a provider actually produced sound. ``latency_ms`` is measured from the
    moment the request is sent (final text ready) to the first audio byte
    received — the number the demo cares about.
    """

    text: str
    language: str
    provider: Provider  # "elevenlabs" | "minimax" | "browser"
    latency_ms: float | None = None
    sample_rate: int = DEFAULT_SAMPLE_RATE
    mime_type: str = "audio/pcm"
    audio: bytes = b""
    # True when no real audio was produced (e.g. browser last-resort marker):
    # the agent should fall back to client-side synthesis for this turn.
    synthesized_client_side: bool = False

    def to_voice_spoken_payload(self) -> dict[str, object]:
        """Shape matching the contract's ``voice.spoken`` payload (Agent 1 emits)."""
        payload: dict[str, object] = {
            "text": self.text,
            "speaker": "agent",
            "language": self.language,
            "provider": self.provider,
        }
        if self.latency_ms is not None:
            payload["latency_ms"] = round(self.latency_ms, 1)
        return payload


@runtime_checkable
class TTSAdapter(Protocol):
    """Minimal interface every voice provider implements.

    Implementations stream short chunks so the agent starts speaking quickly,
    and measure latency from final text to first audio byte.
    """

    name: Provider

    def available(self) -> bool:
        """True if credentials/config for this provider are present."""
        ...

    def livekit_tts(self) -> lk_tts.TTS:
        """Build a ``livekit.agents.tts.TTS`` for ``AgentSession(tts=...)``.

        Raises ``RuntimeError`` if the provider is unavailable or cannot back a
        live pipeline (e.g. the browser last-resort marker).
        """
        ...

    async def synthesize(self, text: str, *, language: str = "en") -> TTSResult:
        """One-shot synthesis returning audio bytes + measured first-byte latency."""
        ...


@dataclass(slots=True)
class VoiceSelection:
    """What ``select_tts`` returns: the chosen adapter + why, for the trace.

    ``adapter`` is the picked provider. ``considered`` records every provider in
    preference order with its availability, so the runtime trace / runbook can
    explain *why* this voice was chosen (and which fallbacks exist).
    """

    adapter: TTSAdapter
    considered: list[tuple[Provider, bool]] = field(default_factory=list)

    @property
    def provider(self) -> Provider:
        return self.adapter.name

    def livekit_tts(self) -> lk_tts.TTS:
        return self.adapter.livekit_tts()

    async def synthesize(self, text: str, *, language: str = "en") -> TTSResult:
        return await self.adapter.synthesize(text, language=language)

    def describe(self) -> str:
        order = ", ".join(
            f"{name}{'' if ok else ' (unavailable)'}" for name, ok in self.considered
        )
        return f"voice={self.provider} | preference: {order}"
