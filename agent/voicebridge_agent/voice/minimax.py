"""MiniMax TTS adapter — LOCAL implementation (sponsor voice path).

The first-party ``livekit-plugins-minimax`` pins an old ``livekit-agents`` core,
so we implement MiniMax ourselves against the current core. This adapter:

- Calls the MiniMax T2A v2 streaming HTTP API (``/v1/t2a_v2`` with ``stream=true``),
  which returns Server-Sent-Events whose ``data.audio`` is hex-encoded PCM. We
  request raw PCM @ 24kHz so chunks need only a hex decode before reaching the
  pipeline (no audio decoder, lowest latency). API shape confirmed via MiniMax
  platform docs + LiveKit's HTTP-TTS plugin pattern (groq/inworld), June 2026.
- Exposes ``livekit_tts()`` returning a ``tts.TTS`` subclass whose ``ChunkedStream``
  streams those PCM chunks into the AgentSession (``streaming=False`` capability,
  so the core wraps it with its sentence-stream pacer for incremental synthesis).
- Logs latency from final text to first audio byte into ``TTSResult.latency_ms``.

Model defaults to ``MINIMAX_TTS_MODEL`` (``speech-2.8-hd``). ``MINIMAX_GROUP_ID`` is
optional on the international endpoint; when present it is sent as ``?GroupId=``.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING

import aiohttp

from voicebridge_agent.config import Config

from .base import NUM_CHANNELS, TTSResult

if TYPE_CHECKING:
    from livekit.agents import tts as lk_tts

# International endpoint. (China endpoint is api.minimaxi.chat; the .env key here
# is the international account, so we use api.minimax.io.)
_API_BASE = "https://api.minimax.io/v1/t2a_v2"

# Raw PCM @ 24kHz mono — matches the pipeline; hex-decoded bytes are ready to push.
_SAMPLE_RATE = 24000
_AUDIO_FORMAT = "pcm"

# MiniMax requires a voice_id; this is its stock calm English voice. The demo
# voice can be overridden later, but a stock id keeps the sponsor path working
# out of the box without provisioning a custom voice.
DEFAULT_VOICE_ID = "English_expressive_narrator"


@dataclass(slots=True)
class _MiniMaxParams:
    """Shared request parameters for both the standalone and pipeline paths."""

    api_key: str
    model: str
    voice_id: str
    group_id: str | None
    sample_rate: int = _SAMPLE_RATE

    def endpoint(self) -> str:
        if self.group_id:
            return f"{_API_BASE}?GroupId={self.group_id}"
        return _API_BASE

    def headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def body(self, text: str, *, stream: bool) -> dict[str, object]:
        return {
            "model": self.model,
            "text": text,
            "stream": stream,
            "voice_setting": {
                "voice_id": self.voice_id,
                "speed": 1.0,
                "vol": 1.0,
                "pitch": 0,
            },
            "audio_setting": {
                "sample_rate": self.sample_rate,
                "format": _AUDIO_FORMAT,
                "channel": NUM_CHANNELS,
            },
            # Auto-detect language so the mid-call Spanish switch is handled
            # without re-instantiating the TTS.
            "language_boost": "auto",
        }


def _iter_sse_audio(line: bytes) -> bytes | None:
    """Parse one SSE line; return decoded PCM bytes for an audio chunk, else None.

    MiniMax streams ``data: {json}`` lines where ``data.audio`` is hex PCM and
    ``data.status == 1`` marks an audio chunk (status 2 is the final summary).
    """
    text = line.strip()
    if not text.startswith(b"data:"):
        return None
    raw = text[len(b"data:") :].strip()
    if not raw or raw == b"[DONE]":
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    data = parsed.get("data") or {}
    audio_hex = data.get("audio")
    if not audio_hex or data.get("status") == 2:
        return None
    try:
        return bytes.fromhex(audio_hex)
    except ValueError:
        return None


def _minimax_error_from_line(line: bytes) -> str | None:
    """Return a MiniMax base_resp error from an SSE or JSON line, if present."""
    text = line.strip()
    if text.startswith(b"data:"):
        text = text[len(b"data:") :].strip()
    if not text or text == b"[DONE]":
        return None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    base_resp = parsed.get("base_resp")
    if not isinstance(base_resp, dict):
        return None
    status_code = base_resp.get("status_code")
    if status_code in {None, 0}:
        return None
    status_msg = base_resp.get("status_msg") or "MiniMax request failed"
    return f"MiniMax error {status_code}: {status_msg}"


class MiniMaxAdapter:
    """Sponsor voice path. Live pipeline via a local tts.TTS; HTTP one-shot for latency."""

    name = "minimax"

    def __init__(self, config: Config, *, voice_id: str = DEFAULT_VOICE_ID) -> None:
        self._cfg = config
        self._voice_id = voice_id

    def available(self) -> bool:
        return self._cfg.has_minimax

    def _params(self) -> _MiniMaxParams:
        if not self.available():
            raise RuntimeError("MiniMax unavailable: set MINIMAX_API_KEY.")
        return _MiniMaxParams(
            api_key=self._cfg.minimax_api_key or "",
            model=self._cfg.minimax_model,
            voice_id=self._voice_id,
            group_id=self._cfg.minimax_group_id,
        )

    def livekit_tts(self) -> lk_tts.TTS:
        """Custom tts.TTS subclass streaming MiniMax PCM into the AgentSession."""
        return _build_livekit_tts(self._params())

    async def synthesize(self, text: str, *, language: str = "en") -> TTSResult:
        """Stream MiniMax PCM over SSE and measure final-text -> first-audio-byte."""
        params = self._params()
        chunks: list[bytes] = []
        latency_ms: float | None = None
        start = time.perf_counter()
        async with aiohttp.ClientSession() as session:
            async with session.post(
                params.endpoint(),
                json=params.body(text, stream=True),
                headers=params.headers(),
                # Large read buffer: hex PCM lines can be big; avoids "Chunk too big".
                read_bufsize=10 * 1024 * 1024,
            ) as resp:
                resp.raise_for_status()
                async for raw_line in resp.content:
                    if error := _minimax_error_from_line(raw_line):
                        raise RuntimeError(error)
                    pcm = _iter_sse_audio(raw_line)
                    if pcm is None:
                        continue
                    if latency_ms is None:
                        latency_ms = (time.perf_counter() - start) * 1000.0
                    chunks.append(pcm)

        if not chunks:
            raise RuntimeError("MiniMax returned no audio chunks.")

        return TTSResult(
            text=text,
            language=language,
            provider=self.name,
            latency_ms=latency_ms,
            sample_rate=params.sample_rate,
            mime_type="audio/pcm",
            audio=b"".join(chunks),
        )


def _build_livekit_tts(params: _MiniMaxParams) -> lk_tts.TTS:
    """Construct the custom livekit tts.TTS (imported lazily so base import stays light)."""
    import asyncio

    from livekit.agents import (
        APIConnectionError,
        APIStatusError,
        APITimeoutError,
        tts,
        utils,
    )
    from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, APIConnectOptions

    class _MiniMaxTTS(tts.TTS):
        def __init__(self) -> None:
            super().__init__(
                # HTTP one-shot per sentence; the core's sentence pacer chunks the
                # LLM output so the agent still starts speaking quickly.
                capabilities=tts.TTSCapabilities(streaming=False),
                sample_rate=params.sample_rate,
                num_channels=NUM_CHANNELS,
            )
            self._params = params
            self._session: aiohttp.ClientSession | None = None

        @property
        def provider(self) -> str:
            return "MiniMax"

        def _ensure_session(self) -> aiohttp.ClientSession:
            if self._session is None:
                self._session = utils.http_context.http_session()
            return self._session

        def synthesize(
            self,
            text: str,
            *,
            conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        ) -> tts.ChunkedStream:
            return _MiniMaxChunkedStream(tts=self, input_text=text, conn_options=conn_options)

    class _MiniMaxChunkedStream(tts.ChunkedStream):
        def __init__(
            self,
            *,
            tts: _MiniMaxTTS,
            input_text: str,
            conn_options: APIConnectOptions,
        ) -> None:
            super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
            self._tts = tts

        async def _run(self, output_emitter: tts.AudioEmitter) -> None:
            p = self._tts._params
            try:
                async with self._tts._ensure_session().post(
                    p.endpoint(),
                    json=p.body(self._input_text, stream=True),
                    headers=p.headers(),
                    timeout=aiohttp.ClientTimeout(
                        total=30, sock_connect=self._conn_options.timeout
                    ),
                    read_bufsize=10 * 1024 * 1024,
                ) as resp:
                    resp.raise_for_status()
                    output_emitter.initialize(
                        request_id=utils.shortuuid(),
                        sample_rate=p.sample_rate,
                        num_channels=NUM_CHANNELS,
                        mime_type="audio/pcm",
                    )
                    chunks = 0
                    async for raw_line in resp.content:
                        if error := _minimax_error_from_line(raw_line):
                            raise APIStatusError(
                                message=error,
                                status_code=resp.status,
                                request_id=None,
                                body=None,
                            )
                        pcm = _iter_sse_audio(raw_line)
                        if pcm is None:
                            continue
                        chunks += 1
                        output_emitter.push(pcm)
                        # PCM is gapless; flush each chunk so audio plays as it lands.
                        output_emitter.flush()
                    if chunks == 0:
                        raise APIStatusError(
                            message="MiniMax returned no audio chunks.",
                            status_code=resp.status,
                            request_id=None,
                            body=None,
                        )
            except asyncio.TimeoutError:
                raise APITimeoutError() from None
            except aiohttp.ClientResponseError as e:
                raise APIStatusError(
                    message=e.message, status_code=e.status, request_id=None, body=None
                ) from None
            except Exception as e:
                raise APIConnectionError() from e

    return _MiniMaxTTS()


__all__ = ["MiniMaxAdapter", "DEFAULT_VOICE_ID"]
