"""Helpers to publish VoiceBridge contract events over the LiveKit data channel.

Agents 1 (transport) and 2 (voice) use this to emit ``call.*`` and ``voice.*``
events. The brain (Codex's agents) emits the rest. Everything goes through the
same topic so the user console (Agent 6) and insurer portal (Agent 7) can render
a single ordered stream.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from voicebridge_contract import EVENT_TOPIC, Event, EventType, MemoryScope, make_event

if TYPE_CHECKING:  # avoid importing the heavy SDK at module load
    from livekit import rtc


async def publish_event(
    room: rtc.Room,
    type: EventType,
    payload: dict[str, Any] | None = None,
    scope: MemoryScope | None = None,
) -> Event:
    """Build a contract event and publish it to all participants.

    Returns the event so callers can also log it locally.
    """
    event = make_event(type, payload, scope)
    await room.local_participant.publish_data(
        event.encode(),
        reliable=True,
        topic=EVENT_TOPIC,
    )
    return event


async def publish_existing_event(room: rtc.Room, event: Event) -> Event:
    """Publish an already-built contract event to all participants."""
    await room.local_participant.publish_data(
        event.encode(),
        reliable=True,
        topic=EVENT_TOPIC,
    )
    return event
