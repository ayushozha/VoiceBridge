"""Controlled in-app insurer participant (Agent 1) — no real SIP.

Simulates the Northstar Insurance representative as a second participant in the
same LiveKit room. It connects under the ``northstar_rep`` identity and plays the
spec demo lines as ``insurer.utterance`` contract events on the shared data
channel, so the user console and insurer portal render a coherent two-sided
transcript without a real outbound phone call.

This deliberately keeps SIP out of scope (no trunk credentials needed). When a
real ``LIVEKIT_SIP_OUTBOUND_TRUNK_ID`` exists, the same room can later host a SIP
participant instead — the rest of the system is identical because everything is
driven off the typed event stream.

Run standalone (drives the scripted insurer into the demo room):

    cd agent
    uv run python -m voicebridge_agent.transport.insurer
"""

from __future__ import annotations

import asyncio
import logging

from livekit import api, rtc
from voicebridge_contract import EVENT_TOPIC, MemoryScope, make_event

from voicebridge_agent.config import Config, load_config

logger = logging.getLogger("voicebridge.insurer")

INSURER_IDENTITY = "northstar_rep"

# The scripted insurer side of the spec demo flow (English representative lines).
# Each tuple is (delay_seconds_before_line, text). Delays make it feel like a
# real turn-taking call rather than a wall of text.
INSURER_SCRIPT: tuple[tuple[float, str], ...] = (
    (2.0, "I see you called yesterday about a home claim. Are you calling about the same claim?"),
    (6.0, "Can I have the claim number?"),
    (
        6.0,
        "Thank you. The claim is still pending. We need photos of the damage "
        "and a repair estimate.",
    ),
    (6.0, "The deadline is Friday, and the upload link is in the claims portal."),
)


def _mint_insurer_token(cfg: Config) -> str:
    """Mint a join token for the controlled insurer participant."""
    if not cfg.has_livekit:
        raise SystemExit(
            "LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET are required "
            "to connect the controlled insurer participant."
        )
    token = (
        api.AccessToken(cfg.livekit_api_key, cfg.livekit_api_secret)
        .with_identity(INSURER_IDENTITY)
        .with_name("Northstar Representative")
        .with_metadata('{"role":"insurer"}')
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=cfg.room_name,
                can_publish=True,
                can_publish_data=True,
                can_subscribe=True,
            )
        )
    )
    return token.to_jwt()


async def _publish_event(room: rtc.Room, type_: str, payload: dict, scope: MemoryScope) -> None:
    event = make_event(type_, payload, scope)  # type: ignore[arg-type]
    await room.local_participant.publish_data(
        event.encode(),
        reliable=True,
        topic=EVENT_TOPIC,
    )


async def run_insurer_participant(
    cfg: Config | None = None,
    *,
    script: tuple[tuple[float, str], ...] = INSURER_SCRIPT,
    loop_once: bool = True,
) -> None:
    """Connect the controlled insurer participant and play the scripted lines.

    Returns after the script completes (when ``loop_once``), then disconnects.
    """
    cfg = cfg or load_config()
    scope = MemoryScope(tenant_id=cfg.tenant_id, user_id=cfg.user_id, case_id=cfg.case_id)

    room = rtc.Room()
    token = _mint_insurer_token(cfg)

    logger.info("Controlled insurer connecting to room=%s as %s", cfg.room_name, INSURER_IDENTITY)
    assert cfg.livekit_url is not None  # guarded by has_livekit in _mint_insurer_token
    await room.connect(cfg.livekit_url, token)
    logger.info("Controlled insurer connected.")

    try:
        for delay, line in script:
            await asyncio.sleep(delay)
            logger.info("[insurer] %s", line)
            await _publish_event(
                room,
                "insurer.utterance",
                {"text": line, "speaker": "insurer", "language": "en"},
                scope,
            )
        if loop_once:
            # Small grace period so the last packet flushes before disconnect.
            await asyncio.sleep(1.0)
    finally:
        await room.disconnect()
        logger.info("Controlled insurer disconnected.")


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_insurer_participant())


if __name__ == "__main__":
    main()
