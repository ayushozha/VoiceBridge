"""CommandOS/VoiceBridge agent worker entrypoint (Agent 1: voice infrastructure).

Joins the LiveKit room as the VoiceBridge agent and runs an STT-LLM-TTS voice
pipeline (LiveKit Agents 1.5.x ``AgentServer`` / ``AgentSession``). On every job
it emits the ``call.*`` contract events the surface (user console + insurer
portal) renders, then hands conversation logic to the brain via tools.

Pipeline (all swappable, fastest-reliable defaults):
  - STT:  LiveKit Inference (Deepgram Nova-3, multilingual) — no extra keys on
          LiveKit Cloud; supports the mid-call EN->ES switch out of the box.
  - LLM:  LiveKit Inference for the live room. Provider-specific LLM adapters
          stay available for readiness checks, but the demo job process avoids
          thread-unsafe plugin registration.
  - TTS:  LiveKit Inference for the live room. ElevenLabs remains available for
          direct latency checks, but the demo job process avoids thread-unsafe
          plugin registration.
  - VAD: Silero VAD. Multilingual STT still supports the EN->ES switch; the
         optional turn-detector runner is not required for the live demo path.

Run (from repo root):
    pnpm agent:dev        # uv run python -m voicebridge_agent.agent dev
    pnpm agent:console    # talk in the terminal

Importing this module has no side effects (no SDK connection, no CLI run), so
``python -c "import voicebridge_agent.agent"`` is a safe config/import sanity
check.
"""

from __future__ import annotations

import logging
import sys
import textwrap
import time
from typing import TYPE_CHECKING, Any

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
    inference,
    room_io,
)
from livekit.plugins import silero
from voicebridge_contract import DEMO_LANGUAGES, Event, MemoryScope

from voicebridge_agent.config import Config, load_config
from voicebridge_agent.events import publish_event, publish_existing_event
from voicebridge_agent.transport import HealthState, build_health_state

if TYPE_CHECKING:  # keep heavy/typing-only imports out of runtime
    from livekit.agents.llm import LLM as LLMBase
    from livekit.agents.tts import TTS as TTSBase

    from voicebridge_agent.voice import VoiceSelection

logger = logging.getLogger("voicebridge.agent")

# NVIDIA exposes an OpenAI-compatible Chat Completions endpoint for its NIM /
# Nemotron models. Used only when the Nemotron key is present.
NVIDIA_OPENAI_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_NEMOTRON_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1"

# LiveKit Inference defaults (LiveKit Cloud; no extra provider keys needed).
INFERENCE_STT_MODEL = "deepgram/nova-3"
INFERENCE_LLM_MODEL = "openai/gpt-4o-mini"
INFERENCE_TTS_MODEL = "cartesia/sonic-2"

AGENT_IDENTITY = "commandos_agent"

INSTRUCTIONS = textwrap.dedent(
    """\
    You are CommandOS, a voice operating system for live business incidents.
    You talk with the operator, ask crisp follow-up questions, and build the
    incident workspace through backend events.

    # Output rules (this is a voice channel)
    - Plain speech only. No markdown, lists, JSON, emojis, or symbols.
    - Keep it short and direct: one to two sentences. Calm, clear, unhurried.
    - Prefer operational certainty over dramatic phrasing.

    # Hard guardrails (never violate)
    - Never imply you executed infrastructure actions unless a real adapter did it.
    - Never recommend restarting the payment gateway until queue depth is checked
      and human approval is confirmed.
    - If an action is risky, explain the missing precondition and offer the next
      safe step.

    # Flow
    - Start from the operator's question.
    - Ask for the missing scope before building the incident model.
    - Use prior incident memory to change recommendations.
    - Convert the final event log into a dashboard and report.
    """
)


class VoiceBridgeAgent(Agent):
    """The in-room CommandOS agent. Conversation tools are attached by the brain."""

    def __init__(self, llm: LLMBase | None = None) -> None:
        kwargs: dict[str, Any] = {"instructions": INSTRUCTIONS}
        if llm is not None:
            kwargs["llm"] = llm
        super().__init__(**kwargs)


def _build_llm(cfg: Config) -> LLMBase | str:
    """Pick the live-room LLM.

    LiveKit's job runner imports project code inside its worker process. Some
    provider plugins register global state on import and must run on the main
    thread, so the demo voice session uses LiveKit Inference directly.
    """
    if cfg.has_model_fallback or cfg.has_nvidia:
        logger.info("LLM: LiveKit Inference (%s) for thread-safe demo runtime", INFERENCE_LLM_MODEL)
    logger.info("LLM: LiveKit Inference (%s)", INFERENCE_LLM_MODEL)
    return inference.LLM(model=INFERENCE_LLM_MODEL)


def _build_tts_legacy(cfg: Config) -> TTSBase | str:
    """Pick the TTS via Agent 2's voice adapter, then ElevenLabs, then Inference.

    Agent 2 owns ``voicebridge_agent.voice``; we only consume its seam. If the
    adapter module doesn't expose a builder yet, fall back so the call still has
    a voice.
    """
    # 1) Agent 2's adapter, if it has published a build_tts() seam.
    try:
        from voicebridge_agent import voice as voice_pkg

        builder = getattr(voice_pkg, "build_tts", None)
        if callable(builder):
            tts = builder(cfg)
            if tts is not None:
                logger.info("TTS: voicebridge_agent.voice.build_tts adapter")
                return tts
    except Exception:  # noqa: BLE001 — adapter is optional; never break the call
        logger.debug("voice.build_tts adapter unavailable; using fallback", exc_info=True)

    # 2) First-party ElevenLabs plugin (reliable low-latency default).
    #    has_elevenlabs guarantees both the key and voice id are present.
    if cfg.has_elevenlabs and cfg.elevenlabs_voice_id:
        from livekit.plugins import elevenlabs

        logger.info("TTS: ElevenLabs plugin (voice_id=%s)", cfg.elevenlabs_voice_id)
        return elevenlabs.TTS(
            voice_id=cfg.elevenlabs_voice_id,
            api_key=cfg.elevenlabs_api_key,
        )

    # 3) LiveKit Inference (LiveKit Cloud; no extra keys).
    logger.info("TTS: LiveKit Inference (%s)", INFERENCE_TTS_MODEL)
    return inference.TTS(model=INFERENCE_TTS_MODEL)


def _startup_log(message: str) -> None:
    """Emit a visible startup line even when the LiveKit CLI is quiet."""
    print(f"[voicebridge-agent] {message}", flush=True)


def _select_voice(cfg: Config) -> VoiceSelection:
    """Select the configured voice provider and preserve trace metadata."""
    from voicebridge_agent.voice import select_tts

    selection = select_tts(cfg)
    logger.info("TTS selection: %s", selection.describe())
    return selection


def _build_tts(selection: VoiceSelection) -> TTSBase | str:
    """Pick the live-room TTS.

    Keep provider selection visible in logs, but use LiveKit Inference in the
    job process to avoid thread-unsafe third-party plugin registration.
    """
    if selection.provider != "browser":
        logger.info(
            "TTS: LiveKit Inference (%s) for thread-safe demo runtime; selected=%s",
            INFERENCE_TTS_MODEL,
            selection.provider,
        )
    logger.info("TTS: LiveKit Inference (%s)", INFERENCE_TTS_MODEL)
    return inference.TTS(model=INFERENCE_TTS_MODEL)


async def _publish_brain_events(room: Any, scope: MemoryScope) -> list[Event]:
    """Run the deterministic brain and publish its events into the live room."""
    from voicebridge_brain.commandos import CommandOSOrchestrator

    events = CommandOSOrchestrator().run(scope=scope)
    for event in events:
        await publish_existing_event(room, event)
    logger.info("Published %s brain events to LiveKit topic", len(events))
    return events


async def _say_and_publish_voice(
    session: AgentSession,
    room: Any,
    scope: MemoryScope,
    *,
    text: str,
    language: str,
    provider: str,
) -> None:
    """Speak one deterministic line and emit a matching voice.spoken event."""
    started = time.perf_counter()
    try:
        speech = session.say(text, add_to_chat_ctx=True)
        await speech.wait_for_playout()
    except RuntimeError as exc:
        if "closing" in str(exc).lower():
            logger.info("Skipping voice playback because the agent session is closing")
            return
        raise
    latency_ms = (time.perf_counter() - started) * 1000.0
    await publish_event(
        room,
        "voice.spoken",
        {
            "text": text,
            "speaker": "agent",
            "language": language,
            "provider": provider,
            "latency_ms": round(latency_ms, 1),
        },
        scope,
    )


def smoke_check() -> None:
    """Validate config and import surfaces without starting a worker."""
    cfg = load_config()
    selection = _select_voice(cfg)
    from voicebridge_brain.commandos import CommandOSOrchestrator

    scope = MemoryScope(tenant_id=cfg.tenant_id, user_id=cfg.user_id, case_id=cfg.case_id)
    event_count = len(CommandOSOrchestrator().run(scope=scope))
    _startup_log(
        "smoke ok | "
        f"livekit={cfg.has_livekit} elevenlabs={cfg.has_elevenlabs} "
        f"minimax={cfg.has_minimax} qwen={cfg.has_qwen} nvidia={cfg.has_nvidia} "
        f"model_fallback={cfg.has_model_fallback} "
        f"voice={selection.provider} brain_events={event_count}"
    )


def prewarm(proc: JobProcess) -> None:
    """Load the Silero VAD once per process so the first job starts fast."""
    proc.userdata["vad"] = silero.VAD.load()


server = AgentServer()
server.setup_fnc = prewarm


@server.rtc_session(agent_name="commandos")
async def entrypoint(ctx: JobContext) -> None:
    """Per-call entrypoint: join the room, wire the pipeline, emit call.* events."""
    cfg = load_config()
    scope = MemoryScope(tenant_id=cfg.tenant_id, user_id=cfg.user_id, case_id=cfg.case_id)
    ctx.log_context_fields = {"room": ctx.room.name, "case_id": cfg.case_id}
    voice_selection = _select_voice(cfg)

    _startup_log(f"job accepted room={ctx.room.name} case_id={cfg.case_id}")
    logger.info(
        "CommandOS agent joining room=%s "
        "(nvidia=%s elevenlabs=%s minimax=%s qwen=%s model_fallback=%s)",
        ctx.room.name,
        cfg.has_nvidia,
        cfg.has_elevenlabs,
        cfg.has_minimax,
        cfg.has_qwen,
        cfg.has_model_fallback,
    )

    # Connect first so we can publish call.started before the session starts.
    await ctx.connect()
    _startup_log(f"connected room={ctx.room.name}")
    await publish_event(
        ctx.room,
        "call.started",
        {"room": ctx.room.name},
        scope,
    )

    session: AgentSession = AgentSession(
        stt=inference.STT(model=INFERENCE_STT_MODEL, language="multi"),
        llm=_build_llm(cfg),
        tts=_build_tts(voice_selection),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )

    await session.start(
        agent=VoiceBridgeAgent(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            # Audio in/out enabled by default; text input on so the console can
            # also drive the agent with typed intent during the demo.
            text_input=True,
        ),
    )
    _startup_log(f"agent session started room={ctx.room.name}")

    health: HealthState = build_health_state(ctx.room, session_started=True)
    await publish_event(
        ctx.room,
        "call.agent_joined",
        {"agent_identity": ctx.room.local_participant.identity or AGENT_IDENTITY},
        scope,
    )
    await publish_event(
        ctx.room,
        "call.audio_ready",
        {"mic_active": health.mic_active, "audio_out_active": health.audio_out_active},
        scope,
    )
    _startup_log(
        "events emitted call.started call.agent_joined call.audio_ready "
        f"room={ctx.room.name}"
    )

    brain_events = await _publish_brain_events(ctx.room, scope)

    # Speak deterministic agent turns from the brain so the live trace contains
    # honest voice.spoken events. Non-agent brain events remain data-channel only.
    for event in brain_events:
        if event.type != "agent.utterance":
            continue
        text = str(event.payload.get("text", "")).strip()
        if not text:
            continue
        await _say_and_publish_voice(
            session,
            ctx.room,
            scope,
            text=text,
            language=str(event.payload.get("language") or DEMO_LANGUAGES[0]),
            provider=voice_selection.provider,
        )


def main() -> None:
    """CLI entry: validate config, then run the LiveKit agent server."""
    if len(sys.argv) > 1 and sys.argv[1] == "smoke":
        smoke_check()
        return

    cfg = load_config()
    _startup_log(
        "config loaded | "
        f"livekit={cfg.has_livekit} elevenlabs={cfg.has_elevenlabs} "
        f"minimax={cfg.has_minimax} qwen={cfg.has_qwen} nvidia={cfg.has_nvidia} "
        f"model_fallback={cfg.has_model_fallback}"
    )
    logger.info(
        "CommandOS agent config: livekit=%s elevenlabs=%s minimax=%s qwen=%s "
        "nvidia=%s model_fallback=%s",
        cfg.has_livekit,
        cfg.has_elevenlabs,
        cfg.has_minimax,
        cfg.has_qwen,
        cfg.has_nvidia,
        cfg.has_model_fallback,
    )
    if not cfg.has_livekit:
        raise SystemExit(
            "LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET are required. "
            "Set them in the repo-root .env."
        )
    _startup_log(f"starting LiveKit worker command={sys.argv[1:] or ['dev']}")
    cli.run_app(server)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
