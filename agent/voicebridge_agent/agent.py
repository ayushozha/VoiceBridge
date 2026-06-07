"""VoiceBridge agent worker entrypoint (Agent 1 target).

Scaffold skeleton: validates config and exposes the worker entrypoint shape.
Agent 1 fills in the AgentSession (STT-LLM-TTS pipeline), room join, controlled
insurer participant, and health checks; Agent 2 wires the voice path. Run via:

    pnpm agent:dev      # uv run python -m voicebridge_agent.agent dev
    pnpm agent:console  # talk in the terminal
"""

from __future__ import annotations

import logging

from voicebridge_agent.config import load_config

logger = logging.getLogger("voicebridge.agent")


def main() -> None:
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

    # Agent 1 wires the LiveKit AgentServer + AgentSession here. The scaffold
    # stops short of importing the SDK so `python -m voicebridge_agent.agent`
    # is runnable before `uv sync` for a quick config sanity check.
    raise SystemExit(
        "Scaffold ready. Agent 1 implements the LiveKit worker in this module."
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
