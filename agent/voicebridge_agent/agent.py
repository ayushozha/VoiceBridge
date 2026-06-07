"""VoiceBridge agent worker entrypoint (Agent 1: call infrastructure).

Joins the LiveKit room as the VoiceBridge agent and runs an STT-LLM-TTS voice
pipeline (LiveKit Agents 1.5.x ``AgentServer`` / ``AgentSession``). On every job
it emits the ``call.*`` contract events the surface (user console + insurer
portal) renders, then hands conversation logic to the brain via tools.

Pipeline (all swappable, fastest-reliable defaults):
  - STT:  LiveKit Inference (Deepgram Nova-3, multilingual) — no extra keys on
          LiveKit Cloud; supports the mid-call EN->ES switch out of the box.
  - LLM:  NVIDIA Nemotron via the OpenAI-compatible plugin when
          ``NVIDIA_NEMOTRON_VOICECHAT_API_KEY`` is set; otherwise LiveKit
          Inference. (The brain/Agent 3 can later route this through TrueFoundry.)
  - TTS:  Agent 2's voice adapter (``voicebridge_agent.voice.build_tts``) when
          present; otherwise the first-party ElevenLabs plugin; otherwise
          LiveKit Inference. Agent 1 only wires the seam — Agent 2 owns voice.
  - VAD + turn detection: Silero VAD + multilingual turn detector.

Run (from repo root):
    pnpm agent:dev        # uv run python -m voicebridge_agent.agent dev
    pnpm agent:console    # talk in the terminal

Importing this module has no side effects (no SDK connection, no CLI run), so
``python -c "import voicebridge_agent.agent"`` is a safe config/import sanity
check.
"""

from __future__ import annotations

import logging
import textwrap
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
from voicebridge_contract import DEMO_LANGUAGES, MemoryScope

from voicebridge_agent.config import Config, load_config
from voicebridge_agent.events import publish_event
from voicebridge_agent.transport import HealthState, build_health_state

if TYPE_CHECKING:  # keep heavy/typing-only imports out of runtime
    from livekit.agents.llm import LLM as LLMBase
    from livekit.agents.tts import TTS as TTSBase

logger = logging.getLogger("voicebridge.agent")

# NVIDIA exposes an OpenAI-compatible Chat Completions endpoint for its NIM /
# Nemotron models. Used only when the Nemotron key is present.
NVIDIA_OPENAI_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_NEMOTRON_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1"

# LiveKit Inference defaults (LiveKit Cloud; no extra provider keys needed).
INFERENCE_STT_MODEL = "deepgram/nova-3"
INFERENCE_LLM_MODEL = "openai/gpt-4o-mini"
INFERENCE_TTS_MODEL = "cartesia/sonic-2"

AGENT_IDENTITY = "voicebridge_agent"

INSTRUCTIONS = textwrap.dedent(
    """\
    You are VoiceBridge, a business-deployed conversational access layer speaking
    on behalf of a member during an insurance phone call. You speak for the user
    only within their confirmed intent.

    # Output rules (this is a voice channel)
    - Plain speech only. No markdown, lists, JSON, emojis, or symbols.
    - Keep it short and direct: one to two sentences. Calm, clear, unhurried.
    - Spell out claim numbers and identifiers clearly when sharing is approved.

    # Hard guardrails (never violate)
    - Never speak a sensitive field (claim number, policy ID, address, date of
      loss, phone number, account number, payment details) until the user has
      explicitly approved that specific disclosure.
    - Never approve, deny, or interpret a claim. Never give medical, legal, or
      financial advice. Never move money or change credentials.
    - You express user intent, ask the representative questions, and summarize
      what the representative says. Nothing more.

    # Flow
    - Greet briefly and state the member is asking about their home claim.
    - When the representative asks for a sensitive field, pause and let the user
      approve before you say it.
    - If the user switches language mid-call, keep the same claim context and
      continue in the new language.
    """
)


class VoiceBridgeAgent(Agent):
    """The in-room VoiceBridge agent. Conversation tools are attached by the brain."""

    def __init__(self, llm: LLMBase | None = None) -> None:
        kwargs: dict[str, Any] = {"instructions": INSTRUCTIONS}
        if llm is not None:
            kwargs["llm"] = llm
        super().__init__(**kwargs)


def _build_llm(cfg: Config) -> LLMBase | str:
    """Pick the LLM: NVIDIA Nemotron (OpenAI-compatible) if keyed, else Inference.

    Returns either a constructed ``llm.LLM`` or a LiveKit Inference model string.
    """
    if cfg.has_nvidia:
        from livekit.plugins import openai

        logger.info("LLM: NVIDIA Nemotron via OpenAI-compatible endpoint")
        return openai.LLM(
            model=NVIDIA_NEMOTRON_MODEL,
            base_url=NVIDIA_OPENAI_BASE_URL,
            api_key=cfg.nvidia_api_key,
        )
    logger.info("LLM: LiveKit Inference (%s)", INFERENCE_LLM_MODEL)
    return inference.LLM(model=INFERENCE_LLM_MODEL)


def _build_tts(cfg: Config) -> TTSBase | str:
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


def prewarm(proc: JobProcess) -> None:
    """Load the Silero VAD once per process so the first job starts fast."""
    proc.userdata["vad"] = silero.VAD.load()


server = AgentServer()
server.setup_fnc = prewarm


@server.rtc_session(agent_name="voicebridge")
async def entrypoint(ctx: JobContext) -> None:
    """Per-call entrypoint: join the room, wire the pipeline, emit call.* events."""
    cfg = load_config()
    scope = MemoryScope(tenant_id=cfg.tenant_id, user_id=cfg.user_id, case_id=cfg.case_id)
    ctx.log_context_fields = {"room": ctx.room.name, "case_id": cfg.case_id}

    logger.info(
        "VoiceBridge agent joining room=%s (nvidia=%s elevenlabs=%s minimax=%s qwen=%s)",
        ctx.room.name,
        cfg.has_nvidia,
        cfg.has_elevenlabs,
        cfg.has_minimax,
        cfg.has_qwen,
    )

    # Connect first so we can publish call.started before the session starts.
    await ctx.connect()
    await publish_event(
        ctx.room,
        "call.started",
        {"room": ctx.room.name},
        scope,
    )

    # Multilingual turn detector lets the EN->ES switch work without retuning.
    from livekit.plugins.turn_detector.multilingual import MultilingualModel

    session: AgentSession = AgentSession(
        stt=inference.STT(model=INFERENCE_STT_MODEL, language="multi"),
        llm=_build_llm(cfg),
        tts=_build_tts(cfg),
        vad=ctx.proc.userdata["vad"],
        turn_detection=MultilingualModel(),
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

    # Brief spoken greeting so the call is audibly live. The brain/Agent 3 takes
    # over real conversation orchestration via tools; this is the bring-up turn.
    greeting_lang = DEMO_LANGUAGES[0]
    await session.generate_reply(
        instructions=(
            f"Greet the representative in {greeting_lang}. Say you are calling on "
            "behalf of the member about their home insurance claim, and keep it to "
            "one short sentence."
        )
    )


def main() -> None:
    """CLI entry: validate config, then run the LiveKit agent server."""
    cfg = load_config()
    logger.info(
        "VoiceBridge agent config: livekit=%s elevenlabs=%s minimax=%s qwen=%s nvidia=%s",
        cfg.has_livekit,
        cfg.has_elevenlabs,
        cfg.has_minimax,
        cfg.has_qwen,
        cfg.has_nvidia,
    )
    if not cfg.has_livekit:
        raise SystemExit(
            "LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET are required. "
            "Set them in the repo-root .env."
        )
    cli.run_app(server)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
