from voicebridge_brain import run_scripted_demo


def test_scripted_demo_preserves_consent_and_language_order() -> None:
    events = run_scripted_demo()
    types = [event.type for event in events]

    assert types[0] == "user.intent"
    assert "memory.recalled" in types
    assert "knowledge.retrieved" in types
    assert types.index("consent.requested") < types.index("consent.approved")
    assert "language.switched" in types
    assert types[-2:] == ["outcome.created", "audit.saved"]

    guardrail_payloads = [event.payload for event in events if event.type == "guardrail.checked"]
    assert guardrail_payloads[0]["decision"] == "block"
    assert guardrail_payloads[1]["decision"] == "allow"

    outcome = next(event.payload for event in events if event.type == "outcome.created")
    assert outcome["claim_number"] == "H-48291"
    assert outcome["language_switch"] == {"from": "en", "to": "es"}
    assert "claim_number" in outcome["sensitive_info_shared"]


def test_scripted_demo_uses_ayush_scope() -> None:
    events = run_scripted_demo()

    assert {event.user_id for event in events} == {"ayush_demo"}
    assert {event.case_id for event in events} == {"home_claim_H-48291"}
