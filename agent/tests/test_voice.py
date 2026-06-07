"""Unit tests for the VoiceBridge voice slice (Agent 2).

No network: ElevenLabs/MiniMax HTTP calls are replaced with an in-memory fake
``aiohttp`` session, so these tests exercise adapter selection, the latency
struct, SSE/hex parsing, and the voice.spoken payload shape without any real API
key or socket. The LiveKit SDK is never imported (livekit_tts is not called).
"""

from __future__ import annotations

import json
from dataclasses import replace

import pytest

from voicebridge_agent.config import Config
from voicebridge_agent.voice import (
    DEMO_AGENT_LINES,
    BrowserFallbackAdapter,
    ElevenLabsAdapter,
    MiniMaxAdapter,
    TTSResult,
    build_adapters,
    run_demo,
    select_tts,
)
from voicebridge_agent.voice.minimax import _iter_sse_audio

# ---------------------------------------------------------------------------
# Config fixtures (no real secrets; values are dummy non-placeholder strings)
# ---------------------------------------------------------------------------

_BASE = Config(
    tenant_id="northstar_insurance",
    user_id="ayush_demo",
    case_id="home_claim_H-48291",
    livekit_url=None,
    livekit_api_key=None,
    livekit_api_secret=None,
    room_name="voicebridge-demo",
    elevenlabs_api_key=None,
    elevenlabs_voice_id=None,
    minimax_api_key=None,
    minimax_group_id=None,
    minimax_model="speech-02-hd",
    qwen_base_url=None,
    qwen_api_key=None,
    qwen_model="qwen-plus",
    nvidia_api_key=None,
)


def cfg(**overrides: object) -> Config:
    return replace(_BASE, **overrides)


CFG_ALL = cfg(
    elevenlabs_api_key="el-key",
    elevenlabs_voice_id="voice-123",
    minimax_api_key="mm-key",
)
CFG_MINIMAX_ONLY = cfg(minimax_api_key="mm-key")
CFG_NONE = _BASE


# ---------------------------------------------------------------------------
# Fake aiohttp session — no sockets. Streams pre-baked bytes.
# ---------------------------------------------------------------------------


class _FakeContent:
    """Mimics aiohttp StreamReader: async line iteration + iter_chunks()."""

    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = chunks

    def __aiter__(self):
        return self._gen_lines()

    async def _gen_lines(self):
        for c in self._chunks:
            yield c

    async def iter_chunks(self):
        for c in self._chunks:
            yield c, True


class _FakeResp:
    def __init__(self, chunks: list[bytes]) -> None:
        self.content = _FakeContent(chunks)

    def raise_for_status(self) -> None:
        return None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None


class _FakeSession:
    """Records the last request and replays canned response chunks."""

    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = chunks
        self.last_url: str | None = None
        self.last_json: dict | None = None
        self.last_headers: dict | None = None

    def post(self, url, *, json=None, headers=None, **kwargs):  # noqa: A002
        self.last_url = url
        self.last_json = json
        self.last_headers = headers
        return _FakeResp(self._chunks)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None


@pytest.fixture
def patch_session(monkeypatch):
    """Patch aiohttp.ClientSession() in a target module to a fake session."""

    def _install(module, chunks: list[bytes]) -> _FakeSession:
        fake = _FakeSession(chunks)
        monkeypatch.setattr(module.aiohttp, "ClientSession", lambda *a, **k: fake)
        return fake

    return _install


# ---------------------------------------------------------------------------
# Selection precedence
# ---------------------------------------------------------------------------


def test_select_prefers_elevenlabs_when_available():
    sel = select_tts(CFG_ALL)
    assert sel.provider == "elevenlabs"
    # Full preference order is recorded for the runtime trace.
    assert sel.considered == [("elevenlabs", True), ("minimax", True), ("browser", True)]


def test_select_falls_back_to_minimax_when_elevenlabs_blocked():
    sel = select_tts(CFG_MINIMAX_ONLY)
    assert sel.provider == "minimax"
    assert sel.considered[0] == ("elevenlabs", False)


def test_select_falls_back_to_browser_when_nothing_configured():
    sel = select_tts(CFG_NONE)
    assert sel.provider == "browser"
    # Browser marker is always available — selection never raises.
    assert sel.considered[-1] == ("browser", True)


def test_build_adapters_order_and_availability():
    adapters = build_adapters(CFG_ALL)
    assert [a.name for a in adapters] == ["elevenlabs", "minimax", "browser"]
    assert all(hasattr(a, "available") and hasattr(a, "synthesize") for a in adapters)


def test_describe_explains_fallback_chain():
    desc = select_tts(CFG_MINIMAX_ONLY).describe()
    assert "voice=minimax" in desc
    assert "elevenlabs (unavailable)" in desc


# ---------------------------------------------------------------------------
# Availability gating
# ---------------------------------------------------------------------------


def test_elevenlabs_available_requires_key_and_voice():
    assert ElevenLabsAdapter(CFG_ALL).available() is True
    assert ElevenLabsAdapter(cfg(elevenlabs_api_key="k")).available() is False  # no voice id
    assert ElevenLabsAdapter(CFG_NONE).available() is False


def test_minimax_available_requires_only_key():
    assert MiniMaxAdapter(CFG_MINIMAX_ONLY).available() is True
    assert MiniMaxAdapter(CFG_NONE).available() is False


def test_browser_always_available():
    assert BrowserFallbackAdapter().available() is True


# ---------------------------------------------------------------------------
# TTSResult / voice.spoken payload
# ---------------------------------------------------------------------------


def test_voice_spoken_payload_shape_matches_contract():
    res = TTSResult(text="hi", language="es", provider="minimax", latency_ms=123.456)
    payload = res.to_voice_spoken_payload()
    assert payload == {
        "text": "hi",
        "speaker": "agent",
        "language": "es",
        "provider": "minimax",
        "latency_ms": 123.5,  # rounded to 1dp
    }


def test_voice_spoken_payload_omits_latency_when_none():
    payload = TTSResult(text="hi", language="en", provider="elevenlabs").to_voice_spoken_payload()
    assert "latency_ms" not in payload
    assert payload["provider"] == "elevenlabs"


# ---------------------------------------------------------------------------
# MiniMax SSE / hex parsing
# ---------------------------------------------------------------------------


def _sse_audio_line(pcm: bytes, status: int = 1) -> bytes:
    body = {"data": {"audio": pcm.hex(), "status": status}, "base_resp": {"status_code": 0}}
    return b"data: " + json.dumps(body).encode("utf-8") + b"\n"


def test_iter_sse_audio_decodes_status_1_chunk():
    assert _iter_sse_audio(_sse_audio_line(b"\x01\x02\x03")) == b"\x01\x02\x03"


def test_iter_sse_audio_skips_final_status_2():
    assert _iter_sse_audio(_sse_audio_line(b"\xff", status=2)) is None


def test_iter_sse_audio_ignores_non_data_and_done_lines():
    assert _iter_sse_audio(b"event: ping\n") is None
    assert _iter_sse_audio(b"data: [DONE]\n") is None
    assert _iter_sse_audio(b"\n") is None
    assert _iter_sse_audio(b"data: not-json\n") is None


# ---------------------------------------------------------------------------
# synthesize() — mocked network, latency + audio accumulation
# ---------------------------------------------------------------------------


async def test_minimax_synthesize_accumulates_pcm_and_logs_latency(patch_session):
    from voicebridge_agent.voice import minimax as mm

    chunks = [
        _sse_audio_line(b"\xaa\xbb"),
        _sse_audio_line(b"\xcc"),
        _sse_audio_line(b"", status=2),
    ]
    fake = patch_session(mm, chunks)

    res = await MiniMaxAdapter(CFG_MINIMAX_ONLY).synthesize("hola", language="es")

    assert res.provider == "minimax"
    assert res.audio == b"\xaa\xbb\xcc"
    assert res.language == "es"
    assert res.latency_ms is not None and res.latency_ms >= 0
    # Request was shaped correctly without a real network call.
    assert fake.last_json["model"] == "speech-02-hd"
    assert fake.last_json["stream"] is True
    assert fake.last_json["audio_setting"]["format"] == "pcm"
    assert fake.last_headers["Authorization"] == "Bearer mm-key"


async def test_minimax_endpoint_appends_group_id_only_when_present(patch_session):
    from voicebridge_agent.voice import minimax as mm

    fake = patch_session(mm, [_sse_audio_line(b"\x00", status=2)])
    await MiniMaxAdapter(cfg(minimax_api_key="mm-key", minimax_group_id="grp-9")).synthesize("hi")
    assert fake.last_url.endswith("?GroupId=grp-9")

    fake2 = patch_session(mm, [_sse_audio_line(b"\x00", status=2)])
    await MiniMaxAdapter(CFG_MINIMAX_ONLY).synthesize("hi")
    assert "GroupId" not in (fake2.last_url or "")


async def test_elevenlabs_synthesize_accumulates_pcm_and_logs_latency(patch_session):
    from voicebridge_agent.voice import elevenlabs as el

    fake = patch_session(el, [b"\x10\x20", b"\x30"])
    res = await ElevenLabsAdapter(CFG_ALL).synthesize("hello", language="en")

    assert res.provider == "elevenlabs"
    assert res.audio == b"\x10\x20\x30"
    assert res.sample_rate == 24000
    assert res.latency_ms is not None and res.latency_ms >= 0
    assert fake.last_json["model_id"] == "eleven_flash_v2_5"
    assert fake.last_json["language_code"] == "en"
    assert fake.last_headers["xi-api-key"] == "el-key"
    assert "pcm_24000" in fake.last_url


async def test_browser_synthesize_is_client_side_marker():
    res = await BrowserFallbackAdapter().synthesize("speak this", language="en")
    assert res.provider == "browser"
    assert res.audio == b""
    assert res.synthesized_client_side is True
    assert res.latency_ms == 0.0


async def test_synthesize_raises_when_unavailable():
    with pytest.raises(RuntimeError):
        await ElevenLabsAdapter(CFG_NONE).synthesize("x")
    with pytest.raises(RuntimeError):
        await MiniMaxAdapter(CFG_NONE).synthesize("x")


# ---------------------------------------------------------------------------
# Demo path
# ---------------------------------------------------------------------------


async def test_run_demo_synthesizes_every_line_with_browser_fallback():
    # No providers -> browser marker; covers the full demo line set end to end.
    results = await run_demo(CFG_NONE)
    assert len(results) == len(DEMO_AGENT_LINES)
    assert all(r.provider == "browser" for r in results)
    # The Spanish mid-call line is present and tagged es.
    assert any(r.language == "es" for r in results)


async def test_run_demo_uses_minimax_when_only_minimax_configured(patch_session):
    from voicebridge_agent.voice import minimax as mm

    # Same canned audio for every line; just assert the provider routing.
    patch_session(mm, [_sse_audio_line(b"\x01", status=2)])
    results = await run_demo(CFG_MINIMAX_ONLY)
    assert all(r.provider == "minimax" for r in results)
