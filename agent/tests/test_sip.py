from __future__ import annotations

from dataclasses import replace

import pytest

from voicebridge_agent.config import Config
from voicebridge_agent.transport.sip import choose_trunk_id, mask_phone, normalize_e164

BASE_CONFIG = Config(
    tenant_id="northstar_insurance",
    user_id="ayush_demo",
    case_id="home_claim_H-48291",
    livekit_url="wss://example.livekit.cloud",
    livekit_api_key="lk-key",
    livekit_api_secret="lk-secret",
    room_name="voicebridge-demo",
    sip_outbound_trunk_id=None,
    demo_outbound_phone_number=None,
    elevenlabs_api_key=None,
    elevenlabs_voice_id=None,
    minimax_api_key=None,
    minimax_group_id=None,
    minimax_model="speech-02-hd",
    qwen_base_url=None,
    qwen_api_key=None,
    qwen_model="qwen-plus",
    nvidia_api_key=None,
)


class _Trunk:
    def __init__(self, trunk_id: str) -> None:
        self.sip_trunk_id = trunk_id


def test_normalize_e164_accepts_ten_digit_us_number() -> None:
    assert normalize_e164("3142990513") == "+13142990513"


def test_normalize_e164_preserves_valid_e164() -> None:
    assert normalize_e164("+1 (314) 299-0513") == "+13142990513"


def test_normalize_e164_rejects_invalid_number() -> None:
    with pytest.raises(ValueError):
        normalize_e164("123")


def test_mask_phone_only_exposes_suffix() -> None:
    assert mask_phone("+13142990513") == "+***0513"


def test_choose_trunk_uses_explicit_config() -> None:
    cfg = replace(BASE_CONFIG, sip_outbound_trunk_id="trunk-explicit")
    assert choose_trunk_id(cfg, [_Trunk("trunk-other")]) == "trunk-explicit"


def test_choose_trunk_auto_selects_single_trunk() -> None:
    assert choose_trunk_id(BASE_CONFIG, [_Trunk("trunk-one")]) == "trunk-one"


def test_choose_trunk_refuses_ambiguous_or_missing_trunks() -> None:
    assert choose_trunk_id(BASE_CONFIG, []) is None
    assert choose_trunk_id(BASE_CONFIG, [_Trunk("a"), _Trunk("b")]) is None
