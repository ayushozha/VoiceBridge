"""Consent and policy guardrails for the VoiceBridge conversation brain."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Protocol

from voicebridge_contract import SENSITIVE_FIELDS, MemoryScope

Decision = Literal["allow", "block"]
Enforcement = Literal["truefoundry", "local"]

TRUEFOUNDRY_SPONSOR = "truefoundry"
LOCAL_PROVIDER = "local_policy"
LOCAL_POLICY_ID = "voicebridge-local-consent-guardrails-v1"

_APPROVED_VALUES = frozenset({"approved", "approve", "allow", "allowed", "yes", "true"})
_DENIED_VALUES = frozenset({"denied", "deny", "block", "blocked", "no", "false"})
_FIELD_ALIASES = {
    "claimnumber": "claim_number",
    "claim_number": "claim_number",
    "policyid": "policy_id",
    "policy_id": "policy_id",
    "dateofloss": "date_of_loss",
    "date_of_loss": "date_of_loss",
    "phonenumber": "phone_number",
    "phone_number": "phone_number",
    "dob": "date_of_birth",
    "dateofbirth": "date_of_birth",
    "date_of_birth": "date_of_birth",
    "ssn": "ssn",
    "accountnumber": "account_number",
    "account_number": "account_number",
    "paymentdetails": "payment_information",
    "paymentinfo": "payment_information",
    "paymentinformation": "payment_information",
    "payment_information": "payment_information",
    "caregivercontact": "caregiver_contact",
    "caregiver_contact": "caregiver_contact",
}

_CLAIM_DECISION_PATTERNS = (
    re.compile(r"\b(approve|approved|approving|deny|denied|denying|reject|rejected)\b.*\bclaim\b"),
    re.compile(r"\bclaim\b.*\b(approved|denied|rejected)\b"),
    re.compile(r"\bcoverage\b.*\b(approved|denied|rejected)\b"),
)
_SAFE_REFUSAL_PATTERNS = (
    "cannot approve or deny",
    "can't approve or deny",
    "can not approve or deny",
    "unable to approve or deny",
    "do not approve or deny",
)
_DANGEROUS_ACTION_ALIASES = {
    "restartgateway": "restart_payment_gateway",
    "restartpaymentgateway": "restart_payment_gateway",
    "restart_payment_gateway": "restart_payment_gateway",
    "restartthepaymentgateway": "restart_payment_gateway",
    "gatewayrestart": "restart_payment_gateway",
}


@dataclass(frozen=True, slots=True)
class GuardrailDecision:
    """Serializable guardrail result for orchestrator events and adapters."""

    action: str
    decision: Decision
    reason: str
    enforced_by: Enforcement
    sponsor: str = TRUEFOUNDRY_SPONSOR
    provider: str = LOCAL_PROVIDER
    policy_id: str = LOCAL_POLICY_ID
    field: str | None = None
    needs_consent: bool = False
    consent_approved: bool = False

    @property
    def allowed(self) -> bool:
        return self.decision == "allow"

    def to_event_payload(self) -> dict[str, Any]:
        """Return a payload compatible with ``guardrail.checked`` events."""
        payload: dict[str, Any] = {
            "action": self.action,
            "decision": self.decision,
            "reason": self.reason,
            "enforced_by": self.enforced_by,
            "sponsor": self.sponsor,
            "provider": self.provider,
            "policy_id": self.policy_id,
            "needs_consent": self.needs_consent,
            "consent_approved": self.consent_approved,
        }
        if self.field is not None:
            payload["field"] = self.field
        return payload


class TrueFoundryGuardrailAdapter(Protocol):
    """Adapter boundary for swapping the local policy with TrueFoundry later."""

    def check_sensitive_disclosure(
        self,
        scope: MemoryScope,
        field: str,
        value: Any,
        consent_state: Any,
    ) -> GuardrailDecision: ...

    def check_claim_decision(
        self,
        scope: MemoryScope,
        proposed_text: str,
    ) -> GuardrailDecision: ...

    def check_dangerous_action(
        self,
        scope: MemoryScope,
        action: str,
        checks: dict[str, bool],
        approval_confirmed: bool,
    ) -> GuardrailDecision: ...


class LocalTrueFoundryGuardrailAdapter:
    """TrueFoundry-shaped local fallback used when live credentials are absent."""

    sponsor = TRUEFOUNDRY_SPONSOR
    provider = LOCAL_PROVIDER
    policy_id = LOCAL_POLICY_ID
    enforced_by: Enforcement = "local"

    def __init__(self, sensitive_fields: set[str] | None = None) -> None:
        self.sensitive_fields = sensitive_fields or load_sensitive_fields()

    def check_sensitive_disclosure(
        self,
        scope: MemoryScope,
        field: str,
        value: Any,
        consent_state: Any,
    ) -> GuardrailDecision:
        del scope, value
        normalized_field = normalize_field(field)
        consent = parse_consent_state(consent_state, normalized_field)
        is_sensitive = normalized_field in self.sensitive_fields

        if not is_sensitive:
            return self._decision(
                action="share_sensitive_field",
                decision="allow",
                reason=f"{normalized_field} is not listed as sensitive in contracts/events.json",
                field=normalized_field,
                needs_consent=False,
                consent_approved=consent.approved,
            )

        if consent.rule == "never_share":
            return self._decision(
                action="share_sensitive_field",
                decision="block",
                reason=f"{normalized_field} is marked never_share",
                field=normalized_field,
                needs_consent=True,
                consent_approved=False,
            )

        if not consent.approved:
            return self._decision(
                action="share_sensitive_field",
                decision="block",
                reason=f"{normalized_field} requires explicit consent before disclosure",
                field=normalized_field,
                needs_consent=True,
                consent_approved=False,
            )

        return self._decision(
            action="share_sensitive_field",
            decision="allow",
            reason=f"explicit consent approved disclosure of {normalized_field}",
            field=normalized_field,
            needs_consent=True,
            consent_approved=True,
        )

    def check_claim_decision(
        self,
        scope: MemoryScope,
        proposed_text: str,
    ) -> GuardrailDecision:
        del scope
        normalized = " ".join(proposed_text.lower().split())
        safe_refusal = any(pattern in normalized for pattern in _SAFE_REFUSAL_PATTERNS)
        unsafe_decision = any(pattern.search(normalized) for pattern in _CLAIM_DECISION_PATTERNS)

        if unsafe_decision and not safe_refusal:
            return self._decision(
                action="claim_decision",
                decision="block",
                reason="VoiceBridge cannot approve, deny, or reject insurance claims",
            )

        return self._decision(
            action="claim_decision",
            decision="allow",
            reason="response does not approve or deny a claim",
        )

    def check_dangerous_action(
        self,
        scope: MemoryScope,
        action: str,
        checks: dict[str, bool],
        approval_confirmed: bool,
    ) -> GuardrailDecision:
        del scope
        normalized_action = normalize_action(action)
        queue_depth_checked = bool(checks.get("queue_depth_checked"))

        if normalized_action != "restart_payment_gateway":
            return self._decision(
                action=normalized_action,
                decision="allow",
                reason=f"{normalized_action} is not listed as a dangerous demo action",
            )

        if not queue_depth_checked:
            return self._decision(
                action=normalized_action,
                decision="block",
                reason="queue depth must be checked before restarting the payment gateway",
            )

        if not approval_confirmed:
            return self._decision(
                action=normalized_action,
                decision="block",
                reason="human approval is required before controlled gateway restart",
            )

        return self._decision(
            action=normalized_action,
            decision="allow",
            reason="queue depth check and human approval are complete",
        )

    def _decision(
        self,
        *,
        action: str,
        decision: Decision,
        reason: str,
        field: str | None = None,
        needs_consent: bool = False,
        consent_approved: bool = False,
    ) -> GuardrailDecision:
        return GuardrailDecision(
            action=action,
            decision=decision,
            reason=reason,
            enforced_by=self.enforced_by,
            sponsor=self.sponsor,
            provider=self.provider,
            policy_id=self.policy_id,
            field=field,
            needs_consent=needs_consent,
            consent_approved=consent_approved,
        )


@dataclass(frozen=True, slots=True)
class _ConsentCheck:
    approved: bool
    rule: str | None = None


def check_sensitive_disclosure(
    scope: MemoryScope,
    field: str,
    value: Any,
    consent_state: Any,
    adapter: TrueFoundryGuardrailAdapter | None = None,
) -> GuardrailDecision:
    """Return whether a sensitive field can be shared with the insurer."""
    checker = adapter or DEFAULT_ADAPTER
    return checker.check_sensitive_disclosure(scope, field, value, consent_state)


def check_claim_decision(
    scope: MemoryScope,
    proposed_text: str,
    adapter: TrueFoundryGuardrailAdapter | None = None,
) -> GuardrailDecision:
    """Block model output that approves, denies, or rejects a claim."""
    checker = adapter or DEFAULT_ADAPTER
    return checker.check_claim_decision(scope, proposed_text)


def check_dangerous_action(
    scope: MemoryScope,
    action: str,
    checks: dict[str, bool] | None = None,
    approval_confirmed: bool = False,
    adapter: TrueFoundryGuardrailAdapter | None = None,
) -> GuardrailDecision:
    """Block risky ops actions until required checks and approval are present."""
    checker = adapter or DEFAULT_ADAPTER
    return checker.check_dangerous_action(scope, action, checks or {}, approval_confirmed)


def load_sensitive_fields() -> set[str]:
    """Load sensitive fields from the canonical events contract with a mirror fallback."""
    contract_path = Path(__file__).resolve().parents[2] / "contracts" / "events.json"
    try:
        data = json.loads(contract_path.read_text(encoding="utf-8"))
        fields = data.get("sensitive_fields", ())
        if isinstance(fields, list):
            return {normalize_field(field) for field in fields if isinstance(field, str)}
    except (OSError, ValueError):
        pass
    return {normalize_field(field) for field in SENSITIVE_FIELDS}


def normalize_field(field: str) -> str:
    compact = re.sub(r"[^a-zA-Z0-9_]", "", field).lower()
    return _FIELD_ALIASES.get(compact, compact)


def normalize_action(action: str) -> str:
    compact = re.sub(r"[^a-zA-Z0-9_]", "", action).lower()
    return _DANGEROUS_ACTION_ALIASES.get(compact, compact)


def parse_consent_state(consent_state: Any, field: str) -> _ConsentCheck:
    """Interpret bool/string/dict consent state shapes from the orchestrator/UI."""
    if isinstance(consent_state, bool):
        return _ConsentCheck(approved=consent_state)

    if isinstance(consent_state, str):
        normalized = consent_state.strip().lower()
        if normalized == "auto_share":
            return _ConsentCheck(approved=True, rule=normalized)
        if normalized == "never_share":
            return _ConsentCheck(approved=False, rule=normalized)
        return _ConsentCheck(approved=normalized in _APPROVED_VALUES)

    if isinstance(consent_state, dict):
        return _parse_consent_dict(consent_state, field)

    status = _object_attr(consent_state, "status") or _object_attr(consent_state, "decision")
    rule = _object_attr(consent_state, "rule") or _object_attr(consent_state, "consent_rule")
    if isinstance(status, str):
        return _ConsentCheck(approved=status.strip().lower() in _APPROVED_VALUES, rule=rule)
    return _ConsentCheck(approved=False, rule=rule)


def _parse_consent_dict(consent_state: dict[str, Any], field: str) -> _ConsentCheck:
    rule = _first_str(consent_state, ("rule", "consent_rule"))
    if rule == "never_share":
        return _ConsentCheck(approved=False, rule=rule)

    denied_fields = consent_state.get("denied_fields")
    if isinstance(denied_fields, list) and field in {
        normalize_field(str(item)) for item in denied_fields
    }:
        return _ConsentCheck(approved=False, rule=rule)

    approved_fields = consent_state.get("approved_fields")
    if isinstance(approved_fields, list) and field in {
        normalize_field(str(item)) for item in approved_fields
    }:
        return _ConsentCheck(approved=True, rule=rule)

    field_state = consent_state.get(field)
    if field_state is not None:
        nested = parse_consent_state(field_state, field)
        return _ConsentCheck(approved=nested.approved, rule=nested.rule or rule)

    consents = consent_state.get("consents")
    if isinstance(consents, dict):
        nested = _parse_consent_dict(consents, field)
        return _ConsentCheck(approved=nested.approved, rule=nested.rule or rule)

    if normalize_field(str(consent_state.get("field", ""))) == field:
        status = _first_str(consent_state, ("decision", "status", "state"))
        if status:
            return _ConsentCheck(approved=status in _APPROVED_VALUES, rule=rule)

    if isinstance(consent_state.get("approved"), bool):
        return _ConsentCheck(approved=bool(consent_state["approved"]), rule=rule)

    if rule == "auto_share":
        return _ConsentCheck(approved=True, rule=rule)

    return _ConsentCheck(approved=False, rule=rule)


def _first_str(data: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = data.get(key)
        if isinstance(value, str):
            return value.strip().lower()
    return None


def _object_attr(value: Any, name: str) -> str | None:
    attr = getattr(value, name, None)
    if isinstance(attr, str):
        return attr.strip().lower()
    return None


DEFAULT_ADAPTER = LocalTrueFoundryGuardrailAdapter()
