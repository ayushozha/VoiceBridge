"""ElevenLabs TTS adapter — PRIMARY, live.

For the live agent pipeline we wrap the first-party ``livekit-plugins-elevenlabs``
TTS so it drops straight into ``AgentSession(tts=...)`` with native streaming and
word-level aligned transcripts (confirmed current via the LiveKit docs MCP, June
2026). We use the lowest-latency multilingual model, ``eleven_flash_v2_5``, so the
Spanish mid-call switch in the demo stays fast and natural.

For the standalone latency demo / ``voice.spoken`` latency_ms, ``synthesize`` calls
the ElevenLabs streaming HTTP endpoint directly and times final-text -> first-byte.
That measurement path has no LiveKit dependency, so it (and its tests) run before
``uv sync``.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

import aiohttp

from voicebridge_agent.config import Config

from .base import NUM_CHANNELS, TTSResult

if TYPE_CHECKING:
    from livekit.agents import tts as lk_tts

# Fast multilingual model — covers the demo's en + es with the lowest latency of
# the ElevenLabs family. The first-party plugin defaults to eleven_flash_v2_5 too,
# but we pin it explicitly so behaviour is reproducible across environments.
DEFAULT_MODEL = "eleven_flash_v2_5"

# ElevenLabs streaming endpoint. PCM @ 24kHz keeps the bytes raw (no decode) and
# matches the agent pipeline sample rate; mp3 would need a decoder for latency math.
_API_BASE = "https://api.elevenlabs.io/v1"
_OUTPUT_FORMAT = "pcm_24000"
_SAMPLE_RATE = 24000


class ElevenLabsAdapter:
    """PRIMARY voice. Live pipeline via the first-party plugin; HTTP one-shot for latency."""

    name = "elevenlabs"

    def __init__(self, config: Config, *, model: str = DEFAULT_MODEL) -> None:
        self._cfg = config
        self._model = model

    def available(self) -> bool:
        return self._cfg.has_elevenlabs

    def livekit_tts(self) -> lk_tts.TTS:
        """First-party ElevenLabs plugin instance for AgentSession(tts=...)."""
        if not self.available():
            raise RuntimeError(
                "ElevenLabs unavailable: set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID."
            )
        # Imported lazily so the module is importable without the SDK installed.
        from livekit.plugins import elevenlabs as lk_elevenlabs

        return lk_elevenlabs.TTS(
            api_key=self._cfg.elevenlabs_api_key,
            voice_id=self._cfg.elevenlabs_voice_id,
            model=self._model,
            # Lowest streaming-latency tier; ElevenLabs flushes audio sooner.
            streaming_latency=3,
        )

    async def synthesize(self, text: str, *, language: str = "en") -> TTSResult:
        """Stream PCM from ElevenLabs and measure final-text -> first-audio-byte."""
        if not self.available():
            raise RuntimeError("ElevenLabs unavailable: missing API key or voice id.")

        url = (
            f"{_API_BASE}/text-to-speech/{self._cfg.elevenlabs_voice_id}/stream"
            f"?output_format={_OUTPUT_FORMAT}"
        )
        body = {
            "text": text,
            "model_id": self._model,
            # language_code steers pronunciation for the mid-call Spanish switch.
            "language_code": language,
        }
        headers = {
            "xi-api-key": self._cfg.elevenlabs_api_key or "",
            "Content-Type": "application/json",
            "Accept": "audio/pcm",
        }

        chunks: list[bytes] = []
        latency_ms: float | None = None
        start = time.perf_counter()
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=body, headers=headers) as resp:
                resp.raise_for_status()
                async for data, _ in resp.content.iter_chunks():
                    if not data:
                        continue
                    if latency_ms is None:
                        latency_ms = (time.perf_counter() - start) * 1000.0
                    chunks.append(data)

        return TTSResult(
            text=text,
            language=language,
            provider=self.name,
            latency_ms=latency_ms,
            sample_rate=_SAMPLE_RATE,
            mime_type="audio/pcm",
            audio=b"".join(chunks),
        )


__all__ = ["ElevenLabsAdapter", "NUM_CHANNELS"]
