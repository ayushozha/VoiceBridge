"""Health helpers for the VoiceBridge call (Agent 1).

Computes the four health signals the web HealthBar mirrors:
room connected, agent joined, mic (input) active, audio out active. Derived from
the live ``rtc.Room`` plus whether the ``AgentSession`` has started, so the
health screen reflects reality rather than a hardcoded "OK".
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # avoid importing the heavy SDK at module load
    from livekit import rtc


@dataclass(slots=True)
class HealthState:
    """Snapshot of the four call-health signals."""

    room_connected: bool
    agent_joined: bool
    mic_active: bool
    audio_out_active: bool

    @property
    def all_ok(self) -> bool:
        return (
            self.room_connected
            and self.agent_joined
            and self.mic_active
            and self.audio_out_active
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _room_connected(room: rtc.Room) -> bool:
    """True if the room reports a connected state.

    ``ConnectionState`` is an enum on the rtc module; compare by name to stay
    resilient across SDK patch versions.
    """
    state = getattr(room, "connection_state", None)
    if state is None:
        # If the room has a local participant identity, it's effectively joined.
        return bool(getattr(getattr(room, "local_participant", None), "identity", None))
    return getattr(state, "name", str(state)).upper().endswith("CONNECTED")


def _has_remote_audio(room: rtc.Room) -> bool:
    """True if any remote participant is publishing a microphone/audio track."""
    remotes = getattr(room, "remote_participants", {}) or {}
    for participant in remotes.values():
        track_pubs = getattr(participant, "track_publications", {}) or {}
        for pub in track_pubs.values():
            kind = getattr(pub, "kind", None)
            kind_name = getattr(kind, "name", str(kind)).upper()
            if "AUDIO" in kind_name:
                return True
    return False


def build_health_state(room: rtc.Room, *, session_started: bool) -> HealthState:
    """Derive a :class:`HealthState` from the room and session status.

    - room_connected: the room transport is connected.
    - agent_joined: the agent's local participant is present in the room.
    - mic_active: a remote participant (user or insurer) is publishing audio,
      so the agent has something to hear. Before anyone else publishes, we still
      report the input *path* as ready once the session has started.
    - audio_out_active: the session is started, so the agent can publish TTS.
    """
    connected = _room_connected(room)
    local = getattr(room, "local_participant", None)
    agent_joined = bool(getattr(local, "identity", None))
    mic_active = session_started and (connected and (_has_remote_audio(room) or agent_joined))
    audio_out_active = session_started and connected
    return HealthState(
        room_connected=connected,
        agent_joined=agent_joined,
        mic_active=mic_active,
        audio_out_active=audio_out_active,
    )
