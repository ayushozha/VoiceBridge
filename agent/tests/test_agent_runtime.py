from __future__ import annotations

from voicebridge_contract import EVENT_TOPIC, MemoryScope, decode_event

from voicebridge_agent.agent import (
    _bootstrap_core_memory,
    _publish_brain_events,
    _say_and_publish_voice,
)
from voicebridge_agent.incident_engines import IncidentEngines


class _FakeLocalParticipant:
    def __init__(self) -> None:
        self.packets: list[tuple[bytes, bool, str]] = []

    async def publish_data(self, data: bytes, *, reliable: bool, topic: str) -> None:
        self.packets.append((data, reliable, topic))


class _FakeRoom:
    def __init__(self) -> None:
        self.local_participant = _FakeLocalParticipant()


class _FakeSpeech:
    async def wait_for_playout(self) -> None:
        return None


class _FakeSession:
    def __init__(self) -> None:
        self.spoken: list[tuple[str, bool]] = []

    def say(self, text: str, *, add_to_chat_ctx: bool) -> _FakeSpeech:
        self.spoken.append((text, add_to_chat_ctx))
        return _FakeSpeech()


class _FakeMossIncidentMemory:
    source = "moss"

    def recall_similar_incident(self, query: str, region: str, system: str) -> dict:
        return {
            "source": "moss",
            "similarity": 0.93,
            "incident_id": "moss_prior_runtime",
            "title": "MOSS prior runtime incident",
            "what_happened": "Gateway queues saturated in Texas.",
            "bad_action": "Restart before queue-depth checks.",
            "successful_action": "Shift traffic before a controlled restart.",
            "owner": "payments_platform_on_call",
            "frontend": {
                "scene": "prior_incident_overlay",
                "overlay": "ghost_texas_gateway_spike",
            },
            "provenance": {
                "store": "moss",
                "region": region,
                "system": system,
                "query": query,
            },
        }

    def remember_incident_learning(self, scope: MemoryScope, report: dict) -> dict:
        return {
            "source": "moss",
            "event": "incident.learning_saved",
            "after": {"case_id": scope.case_id, "latest_report_id": report["report_id"]},
        }


async def test_publish_brain_events_uses_livekit_event_topic() -> None:
    room = _FakeRoom()
    scope = MemoryScope(
        tenant_id="atlaspay",
        user_id="ayush_demo",
        case_id="sev1_tx_payments_2026_06_07",
    )

    events = await _publish_brain_events(room, scope)
    decoded = [decode_event(packet[0]) for packet in room.local_participant.packets]

    assert len(events) == 40
    assert len(decoded) == len(events)
    assert all(packet[1] is True for packet in room.local_participant.packets)
    assert {packet[2] for packet in room.local_participant.packets} == {EVENT_TOPIC}
    assert [event.type for event in decoded if event is not None][:3] == [
        "scene.state",
        "user.intent",
        "incident.started",
    ]
    assert any(event.type == "map.hotspots" for event in decoded if event is not None)
    assert any(event.type == "guardrail.checked" for event in decoded if event is not None)


async def test_say_and_publish_voice_emits_voice_spoken_event() -> None:
    room = _FakeRoom()
    session = _FakeSession()
    scope = MemoryScope()

    await _say_and_publish_voice(
        session,
        room,
        scope,
        text="I found your Northstar home claim.",
        language="en",
        provider="elevenlabs",
    )

    assert session.spoken == [("I found your Northstar home claim.", True)]
    assert len(room.local_participant.packets) == 1
    event = decode_event(room.local_participant.packets[0][0])

    assert event is not None
    assert event.type == "voice.spoken"
    assert event.payload["text"] == "I found your Northstar home claim."
    assert event.payload["speaker"] == "agent"
    assert event.payload["language"] == "en"
    assert event.payload["provider"] == "elevenlabs"
    assert event.payload["latency_ms"] >= 0


async def test_core_mic_loop_bootstraps_moss_memory_events() -> None:
    room = _FakeRoom()
    scope = MemoryScope(
        tenant_id="atlaspay",
        user_id="ayush_demo",
        case_id="sev1_tx_payments_2026_06_07",
    )
    engines = IncidentEngines(room, scope, memory=_FakeMossIncidentMemory())

    await _bootstrap_core_memory(engines)

    decoded = [decode_event(packet[0]) for packet in room.local_participant.packets]
    assert [event.type for event in decoded if event is not None][:2] == [
        "scene.state",
        "scene.state",
    ]

    recall = next(event for event in decoded if event and event.type == "memory.recalled")
    similar = next(
        event for event in decoded if event and event.type == "similar_incident.recalled"
    )

    assert recall is not None
    assert recall.mode == "live"
    assert recall.payload["source"] == "moss"
    assert recall.payload["integration_mode"] == "live"
    assert similar is not None
    assert similar.mode == "live"
    assert similar.payload["provenance"]["store"] == "moss"
