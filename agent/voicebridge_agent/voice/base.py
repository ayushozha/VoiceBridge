"""TTS adapter interface (Agent 2 target).

A thin seam over speech providers so the agent can pick the fastest reliable
voice at runtime and log latency uniformly. ElevenLabs is wired via the
first-party LiveKit plugin; MiniMax is a local adapter (the first-party MiniMax
plugin pins an old core). Scaffold defines the contract; Agent 2 fills it in.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True)
class TTSResult:
    """Outcome of a synthesis, for the voice.spoken event + latency logging."""

    text: str
    language: str
    provider: str  # "elevenlabs" | "minimax" | "browser"
    latency_ms: float | None = None


class TTSAdapter(Protocol):
    """Minimal interface every voice provider implements.

    Implementations should stream short chunks so the agent starts speaking
    quickly, and measure latency from final text to first audio byte.
    """

    name: str

    def available(self) -> bool:
        """True if credentials/config for this provider are present."""
        ...
