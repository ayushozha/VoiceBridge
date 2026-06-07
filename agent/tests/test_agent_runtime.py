from __future__ import annotations

from voicebridge_contract import EVENT_TOPIC, MemoryScope, decode_event

from voicebridge_agent.agent import _publish_brain_events, _say_and_publish_voice


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


async def test_publish_brain_events_uses_livekit_event_topic() -> None:
    room = _FakeRoom()
    scope = MemoryScope(
        tenant_id="northstar_insurance",
        user_id="ayush_demo",
        case_id="home_claim_H-48291",
    )

    events = await _publish_brain_events(room, scope)
    decoded = [decode_event(packet[0]) for packet in room.local_participant.packets]

    assert len(events) == 19
    assert len(decoded) == len(events)
    assert all(packet[1] is True for packet in room.local_participant.packets)
    assert {packet[2] for packet in room.local_participant.packets} == {EVENT_TOPIC}
    assert [event.type for event in decoded if event is not None][:3] == [
        "user.intent",
        "memory.recalled",
        "knowledge.retrieved",
    ]


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
