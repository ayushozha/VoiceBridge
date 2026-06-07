"""Browser / client-side TTS fallback — LAST RESORT.

When no server-side provider is configured (no ElevenLabs key, no MiniMax key),
the agent cannot synthesize audio itself. Rather than crash the call, this
adapter is a *marker*: it always reports available, produces no audio bytes, and
flags ``synthesized_client_side=True`` on its ``TTSResult``.

Agent 1 / the frontend interpret a ``voice.spoken`` event with
``provider="browser"`` as "speak this text with the Web Speech API
(``speechSynthesis``) on the client". That keeps the demo functional with zero
voice credentials, while staying honest in the runtime trace about which path is
live.

It deliberately cannot back a live LiveKit pipeline (``livekit_tts`` raises), so
``select_tts`` only lands here when both real providers are unavailable.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .base import DEFAULT_SAMPLE_RATE, TTSResult

if TYPE_CHECKING:
    from livekit.agents import tts as lk_tts


class BrowserFallbackAdapter:
    """No-network last resort: text-only, client synthesizes via Web Speech API."""

    name = "browser"

    def available(self) -> bool:
        # Always available — it needs nothing. It is the floor of the preference
        # list so a real provider is always chosen first when configured.
        return True

    def livekit_tts(self) -> lk_tts.TTS:
        raise RuntimeError(
            "Browser fallback cannot back a live LiveKit pipeline. It is a "
            "client-side marker: emit voice.spoken with provider='browser' and "
            "let the frontend speak the text via the Web Speech API."
        )

    async def synthesize(self, text: str, *, language: str = "en") -> TTSResult:
        # No server audio; latency is effectively zero on this side. The client
        # owns the actual speech, so we hand back the text + the flag.
        return TTSResult(
            text=text,
            language=language,
            provider=self.name,
            latency_ms=0.0,
            sample_rate=DEFAULT_SAMPLE_RATE,
            mime_type="audio/pcm",
            audio=b"",
            synthesized_client_side=True,
        )


__all__ = ["BrowserFallbackAdapter"]
