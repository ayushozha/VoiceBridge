from voicebridge_contract import MemoryScope

from voicebridge_brain.memory import (
    MOSSMemoryAdapter,
    recall_customer_context,
    remember_call_event,
)


def test_recall_customer_context_returns_seeded_ayush_claim_memory() -> None:
    recall = recall_customer_context(MemoryScope())

    assert recall.source == "local"
    assert recall.score == 0.94
    assert any("H-48291" in line for line in recall.summary)
    assert recall.prior_call["profile_id"] == "user_ayush_demo"
    assert recall.prior_call["style_preferences"]["tone"] == "short_direct"
    assert recall.prior_call["call_history"][0]["missing_documents"] == [
        "damage_photos",
        "repair_estimate",
    ]


def test_remember_call_event_updates_scoped_memory() -> None:
    adapter = MOSSMemoryAdapter()
    scope = MemoryScope()

    write = adapter.remember_call_event(
        scope,
        "language.switched",
        {"from": "en", "to": "es", "preference": "spanish_supported"},
    )

    assert write["source"] == "local"
    assert write["event"] == "language.switched"
    assert write["before"]["event_count"] == 0
    assert write["after"]["event_count"] == 1
    assert write["after"]["last_language"] == "es"

    recall = adapter.recall_customer_context(scope)

    assert recall.prior_call["language_preferences"]["last"] == "es"
    assert recall.prior_call["recent_events"] == [
        {
            "event": "language.switched",
            "payload": {"from": "en", "to": "es", "preference": "spanish_supported"},
        }
    ]


def test_memory_is_isolated_by_scope() -> None:
    adapter = MOSSMemoryAdapter()
    other_scope = MemoryScope(user_id="other_user", case_id="other_case")

    other_recall = adapter.recall_customer_context(other_scope)

    assert other_recall.score == 0.0
    assert other_recall.prior_call == {"call_history": [], "recent_events": []}

    adapter.remember_call_event(
        other_scope,
        "outcome.created",
        {"claim_status": "documents_requested", "missing_documents": ["photo"]},
    )

    ayush_recall = adapter.recall_customer_context(MemoryScope())
    other_recall_after_write = adapter.recall_customer_context(other_scope)

    assert ayush_recall.prior_call["recent_events"] == []
    assert other_recall_after_write.prior_call["recent_events"][0]["event"] == "outcome.created"


def test_module_level_remember_call_event_returns_memory_written_payload() -> None:
    write = remember_call_event(
        MemoryScope(case_id="module_level_case"),
        "correction",
        {"preference_learned": "Use shorter wording."},
    )

    assert write["source"] == "local"
    assert write["event"] == "correction"
    assert write["after"]["case_id"] == "module_level_case"
    assert write["after"]["profile_patch"]["corrections"][0]["instruction"] == (
        "Use shorter wording."
    )
