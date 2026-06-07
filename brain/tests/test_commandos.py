from voicebridge_contract import MemoryScope

from voicebridge_brain import CommandOSOrchestrator, commandos_demo_ndjson, run_commandos_demo


class _FakeMossMemory:
    source = "moss"

    def recall_similar_incident(self, query: str, region: str, system: str) -> dict:
        return {
            "source": "moss",
            "similarity": 0.92,
            "incident_id": "moss_prior_001",
            "title": "Moss prior incident",
            "what_happened": "Gateway queues backed up in Texas.",
            "bad_action": "Restart before queue-depth checks.",
            "successful_action": "Shift traffic before controlled restart.",
            "owner": "payments_platform_on_call",
            "frontend": {"scene": "prior_incident_overlay"},
            "provenance": {
                "store": "moss",
                "index": "voicebridge_communication_memory",
                "document_id": "moss_prior_001",
            },
        }

    def remember_incident_learning(self, scope: MemoryScope, report: dict) -> dict:
        return {
            "source": "moss",
            "provider": "moss",
            "integration_mode": "live",
            "event": "incident.learning_saved",
            "before": {"index_name": "voicebridge_communication_memory"},
            "after": {
                "tenant_id": scope.tenant_id,
                "user_id": scope.user_id,
                "case_id": scope.case_id,
                "latest_report_id": report["report_id"],
                "document_id": "moss_learning_001",
            },
        }


def test_commandos_demo_emits_conversational_incident_sequence() -> None:
    events = run_commandos_demo()
    types = [event.type for event in events]

    assert types[:3] == ["scene.state", "user.intent", "incident.started"]
    assert types.index("query.scoped") < types.index("map.hotspots")
    assert types.index("map.hotspots") < types.index("topology.built")
    assert types.index("topology.built") < types.index("failure.localized")
    assert types.index("similar_incident.recalled") < types.index("mitigation.proposed")
    assert types.index("guardrail.checked") < types.index("approval.requested")
    assert types[-4:] == [
        "report.created",
        "memory.written",
        "outcome.created",
        "audit.saved",
    ]


def test_commandos_demo_is_frontend_replayable() -> None:
    events = run_commandos_demo()

    assert [event.sequence for event in events] == list(range(1, len(events) + 1))
    assert len({event.event_id for event in events}) == len(events)
    assert all(event.turn_id for event in events)
    assert all(event.correlation_id for event in events)

    map_event = next(event for event in events if event.type == "map.hotspots")
    assert map_event.payload["frontend"]["scene"] == "failure_map"
    assert {point["city"] for point in map_event.payload["hotspots"]} == {
        "Dallas",
        "Austin",
        "Houston",
    }

    topology = next(event for event in events if event.type == "topology.built")
    assert any(node["id"] == "payment_gateway" for node in topology.payload["nodes"])
    assert any(edge["status"] == "failing" for edge in topology.payload["edges"])


def test_commandos_guardrail_blocks_unsafe_restart() -> None:
    events = run_commandos_demo()
    guardrail = next(event for event in events if event.type == "guardrail.checked")

    assert guardrail.payload["action"] == "restart_payment_gateway"
    assert guardrail.payload["decision"] == "block"
    assert "queue depth" in guardrail.payload["reason"]
    assert "gateway_queue_depth" in guardrail.payload["required_checks"]


def test_commandos_memory_writes_self_improving_learning() -> None:
    orchestrator = CommandOSOrchestrator()
    first = orchestrator.run()
    second = orchestrator.run()

    first_write = next(event for event in first if event.type == "memory.written")
    second_write = next(event for event in second if event.type == "memory.written")

    assert first_write.payload["event"] == "incident.learning_saved"
    assert first_write.payload["after"]["written_reports"] == 1
    assert second_write.payload["after"]["written_reports"] == 2


def test_commandos_marks_moss_memory_events_live_when_moss_backend_is_injected() -> None:
    events = CommandOSOrchestrator(memory=_FakeMossMemory()).run()

    recall = next(event for event in events if event.type == "memory.recalled")
    similar = next(event for event in events if event.type == "similar_incident.recalled")
    write = next(event for event in events if event.type == "memory.written")

    assert recall.mode == "live"
    assert recall.payload["source"] == "moss"
    assert recall.payload["integration_mode"] == "live"
    assert similar.mode == "live"
    assert similar.payload["provenance"]["store"] == "moss"
    assert write.payload["source"] == "moss"
    assert write.payload["integration_mode"] == "live"


def test_commandos_ndjson_exports_events_for_non_livekit_frontends() -> None:
    lines = commandos_demo_ndjson().splitlines()

    assert lines
    assert '"type": "scene.state"' in lines[0]
