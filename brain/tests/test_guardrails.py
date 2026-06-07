from voicebridge_contract import MemoryScope

from voicebridge_brain.guardrails import (
    check_claim_decision,
    check_sensitive_disclosure,
    load_sensitive_fields,
)


def test_sensitive_claim_number_blocks_without_consent() -> None:
    decision = check_sensitive_disclosure(
        MemoryScope(),
        "claim_number",
        "H-48291",
        consent_state=False,
    )

    assert decision.decision == "block"
    assert decision.action == "share_sensitive_field"
    assert decision.field == "claim_number"
    assert decision.needs_consent is True
    assert decision.consent_approved is False
    assert decision.enforced_by == "local"
    assert decision.sponsor == "truefoundry"
    assert decision.provider == "local_policy"
    assert "H-48291" not in decision.reason


def test_sensitive_field_allows_with_approved_consent_payload() -> None:
    decision = check_sensitive_disclosure(
        MemoryScope(),
        "claim number",
        "H-48291",
        consent_state={"approved_fields": ["claim_number"]},
    )

    assert decision.decision == "allow"
    assert decision.allowed is True

    payload = decision.to_event_payload()
    assert payload["decision"] == "allow"
    assert payload["field"] == "claim_number"
    assert payload["enforced_by"] == "local"
    assert payload["sponsor"] == "truefoundry"
    assert payload["provider"] == "local_policy"
    assert payload["policy_id"] == "voicebridge-local-consent-guardrails-v1"


def test_field_denial_overrides_auto_share() -> None:
    decision = check_sensitive_disclosure(
        MemoryScope(),
        "policy_id",
        "POL-123",
        consent_state={"rule": "auto_share", "denied_fields": ["policy_id"]},
    )

    assert decision.decision == "block"


def test_sensitive_fields_come_from_contract() -> None:
    fields = load_sensitive_fields()

    assert "claim_number" in fields
    assert "payment_information" in fields


def test_claim_decision_guardrail_blocks_claim_approval() -> None:
    decision = check_claim_decision(MemoryScope(), "Northstar approved your claim today.")

    assert decision.decision == "block"
    assert decision.action == "claim_decision"
    assert decision.sponsor == "truefoundry"
    assert decision.provider == "local_policy"


def test_claim_decision_guardrail_allows_safe_refusal() -> None:
    decision = check_claim_decision(
        MemoryScope(),
        "I cannot approve or deny claims, but I can summarize the documents requested.",
    )

    assert decision.decision == "allow"
