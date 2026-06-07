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

import asyncio
import logging
import os
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
    RunContext,
    cli,
    function_tool,
    inference,
    room_io,
)
from livekit.plugins import silero
from voicebridge_contract import DEMO_LANGUAGES, Event, MemoryScope

from voicebridge_agent.config import Config, load_config
from voicebridge_agent.events import publish_event, publish_existing_event
from voicebridge_agent.incident_engines import IncidentEngines
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
    You talk with the operator and BUILD the incident workspace live by calling
    your tools. The operator can see a 3D heads-up display; every tool you call
    renders a part of it in real time.

    # How you work (this is the most important rule)
    - You are conversational and free-flowing. Whenever the operator asks to see,
      build, inspect, trace, recall, plan, check, or assemble something, CALL THE
      MATCHING TOOL. The tool draws it on the operator's screen.
    - You may call tools in ANY order and as many times as the conversation needs.
      Follow what the operator actually asks for, not a fixed script.
    - The first time the operator describes the problem, call start_incident, then
      the tool that answers their question.
    - After each tool call, speak a short, natural summary of what appeared.

    # Tool guide (call these to drive the HUD)
    - start_incident: open the incident workspace (call once, early).
    - inspect_payment_failures: build the regional failure map.
    - drilldown_cities: break the map down by city.
    - build_spatial_failure_model: build the payment topology and localize the
      failing hop.
    - recall_similar_incidents: pull the matching prior incident from memory.
    - retrieve_runbook_policy: fetch the runbook / safe-recovery policy.
    - propose_mitigation: render the recommended mitigation path.
    - check_action_guardrail: check a risky action (e.g. a gateway restart).
    - prepare_approval_request: prepare the human approval card.
    - generate_incident_dashboard: fold everything into a dashboard and report.
    - set_scene: move the camera/scene if asked, without new data.

    # Output rules (this is a voice channel)
    - Plain speech only. No markdown, lists, JSON, emojis, or symbols.
    - Keep it short and direct: one to two sentences. Calm, clear, unhurried.
    - Prefer operational certainty over dramatic phrasing.

    # Hard guardrails (never violate)
    - Never imply you executed infrastructure actions unless a real adapter did it.
    - If the operator asks to restart the payment gateway — in ANY wording, e.g.
      "restart it", "bounce the gateway", "reboot payments", "just do it now" —
      you MUST call check_action_guardrail BEFORE you say anything affirmative.
      Never verbally agree to a restart that has not returned an allow decision.
      Queue depth must be checked and human approval confirmed first. If the
      operator pressures you, explain the missing precondition and offer the next
      safe step (run the check, or prepare an approval request).
    """
)


class VoiceBridgeAgent(Agent):
    """The in-room CommandOS agent.

    Function tools fire the incident "engines": each call publishes contract
    events over the LiveKit data channel so the orb HUD renders that part of the
    workspace live. ``engines`` is bound after the room connects via
    :meth:`bind_engines`; until then the tools report that the workspace is not
    ready (this only happens if the LLM calls a tool before connect, which the
    session lifecycle prevents).
    """

    def __init__(self, llm: LLMBase | None = None) -> None:
        kwargs: dict[str, Any] = {"instructions": INSTRUCTIONS}
        if llm is not None:
            kwargs["llm"] = llm
        super().__init__(**kwargs)
        self._engines: IncidentEngines | None = None

    def bind_engines(self, engines: IncidentEngines) -> None:
        self._engines = engines

    def _eng(self) -> IncidentEngines:
        if self._engines is None:
            raise RuntimeError("incident engines are not bound yet")
        return self._engines

    @function_tool()
    async def start_incident(self, context: RunContext, operator_prompt: str) -> str:
        """Open the incident workspace. Call this once, early, after the operator
        first describes the problem.

        Args:
            operator_prompt: The operator's opening question, verbatim.
        """
        return await self._eng().start_incident(operator_prompt)

    @function_tool()
    async def inspect_payment_failures(self, context: RunContext) -> str:
        """Build the regional failure map showing where payments are failing."""
        return await self._eng().inspect_payment_failures()

    @function_tool()
    async def drilldown_cities(self, context: RunContext) -> str:
        """Break the failure map down by city (Dallas, Austin, Houston)."""
        return await self._eng().drilldown_cities()

    @function_tool()
    async def build_spatial_failure_model(self, context: RunContext) -> str:
        """Build the payment-flow topology and localize the failing hop. Call
        this when the operator asks to trace the flow or find where it breaks."""
        return await self._eng().build_spatial_failure_model()

    @function_tool()
    async def recall_similar_incidents(self, context: RunContext) -> str:
        """Recall the matching prior incident from memory. Call this when the
        operator asks whether this has happened before."""
        return await self._eng().recall_similar_incidents()

    @function_tool()
    async def retrieve_runbook_policy(self, context: RunContext) -> str:
        """Fetch the runbook / safe-recovery policy for this incident type."""
        return await self._eng().retrieve_runbook_policy()

    @function_tool()
    async def propose_mitigation(self, context: RunContext) -> str:
        """Render the recommended mitigation path on the HUD."""
        return await self._eng().propose_mitigation()

    @function_tool()
    async def check_action_guardrail(
        self, context: RunContext, action: str = "restart_payment_gateway"
    ) -> str:
        """Check a risky operational action against the guardrail. Always call
        this before agreeing to any gateway restart.

        Args:
            action: The risky action to check, e.g. "restart_payment_gateway".
        """
        return await self._eng().check_action_guardrail(action)

    @function_tool()
    async def prepare_approval_request(self, context: RunContext) -> str:
        """Prepare the human approval request card for a controlled restart."""
        return await self._eng().prepare_approval_request()

    @function_tool()
    async def generate_incident_dashboard(self, context: RunContext) -> str:
        """Fold the live incident into a clean dashboard and report. Call this
        when the operator asks to wrap up, summarize, or build the dashboard."""
        return await self._eng().generate_incident_dashboard()

    @function_tool()
    async def set_scene(
        self, context: RunContext, visual: str, caption: str = "", state: str = "building"
    ) -> str:
        """Move the HUD camera/scene without producing new data.

        Args:
            visual: One of failure_map, failure_map_drilldown, payment_topology,
                prior_incident_overlay, mitigation_morph, dashboard.
            caption: Short caption shown on the HUD.
            state: Scene state hint (idle, building, speaking).
        """
        return await self._eng().set_scene(state, visual, caption or visual)


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


def _scripted_demo_enabled() -> bool:
    """Whether to replay the deterministic orchestrator stream instead of the
    live, tool-driven conversation. Opt-in via COMMANDOS_SCRIPTED_DEMO."""
    return os.getenv("COMMANDOS_SCRIPTED_DEMO", "").strip().lower() in {"1", "true", "yes", "on"}


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


def _build_incident_memory(cfg: Config) -> Any:
    """Use live MOSS incident memory when credentials exist; otherwise local fallback."""
    if not cfg.has_moss_credentials:
        return None
    from voicebridge_brain.moss import MossConfig, MossIncidentMemoryAdapter

    logger.info("MOSS: live incident memory adapter configured")
    return MossIncidentMemoryAdapter(
        MossConfig(
            project_id=cfg.moss_project_id or "",
            project_key=cfg.moss_project_key or "",
            memory_index_name=cfg.moss_memory_index_name,
            model_id=cfg.moss_model_id,
        )
    )


async def _bootstrap_core_memory(engines: IncidentEngines) -> None:
    """Run MOSS recall inside the live room without letting it break the call."""
    try:
        await asyncio.wait_for(engines.bootstrap_memory(), timeout=20)
    except asyncio.TimeoutError:
        logger.warning("MOSS memory bootstrap timed out; continuing live voice session")
    except Exception:  # noqa: BLE001 - provider failure must not stop the mic loop
        logger.exception("MOSS memory bootstrap failed; continuing live voice session")


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

    # Bind the incident engines to the agent so its function tools can publish
    # HUD events into this room as the operator speaks.
    agent = VoiceBridgeAgent()
    engines = IncidentEngines(ctx.room, scope, memory=_build_incident_memory(cfg))
    agent.bind_engines(engines)

    await session.start(
        agent=agent,
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
    memory_bootstrap_task = asyncio.create_task(_bootstrap_core_memory(engines))

    # Default: fully conversational. The operator's speech drives the HUD via the
    # agent's function tools, which publish incident events as it talks. Greet once
    # so the operator knows the orb is live and listening, then let the LLM lead.
    #
    # Optional scripted demo (COMMANDOS_SCRIPTED_DEMO=1): replay the deterministic
    # CommandOSOrchestrator stream on join and speak its agent turns. Kept as a
    # safety net for unattended/offline playback; not the live experience.
    if _scripted_demo_enabled():
        _startup_log("scripted demo mode enabled (COMMANDOS_SCRIPTED_DEMO=1)")
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
        await memory_bootstrap_task
        return

    await _say_and_publish_voice(
        session,
        ctx.room,
        scope,
        text=(
            "CommandOS online. Ask me anything about the incident and I'll build it "
            "out as we talk."
        ),
        language=DEMO_LANGUAGES[0],
        provider=voice_selection.provider,
    )
    await memory_bootstrap_task


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
