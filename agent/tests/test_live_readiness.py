from __future__ import annotations

from voicebridge_agent.config import Config
from voicebridge_agent.live_readiness import (
    ProbeResult,
    _minimal_pdf_bytes,
    _probe_commandos_flow,
    _probe_env,
    strict_failures,
)


def cfg(**overrides: object) -> Config:
    values = {
        "tenant_id": "atlaspay",
        "user_id": "ayush_demo",
        "case_id": "sev1_tx_payments_2026_06_07",
        "livekit_url": None,
        "livekit_api_key": None,
        "livekit_api_secret": None,
        "room_name": "commandos-demo",
        "sip_outbound_trunk_id": None,
        "demo_outbound_phone_number": None,
        "elevenlabs_api_key": None,
        "elevenlabs_voice_id": None,
        "minimax_api_key": None,
        "minimax_group_id": None,
        "minimax_model": "speech-2.8-hd",
        "qwen_base_url": None,
        "qwen_api_key": None,
        "qwen_model": "qwen-plus",
        "nvidia_api_key": None,
        "moss_project_id": None,
        "moss_project_key": None,
        "moss_index_name": "voicebridge_business_knowledge",
        "moss_memory_index_name": "voicebridge_communication_memory",
        "moss_model_id": "moss-minilm",
        "unsiloed_api_key": None,
        "unsiloed_parse_url": None,
        "truefoundry_api_key": None,
        "truefoundry_gateway_base_url": None,
        "truefoundry_guardrail_config_id": None,
        "truefoundry_model": None,
        "aws_region": "us-west-2",
        "aws_access_key_id": None,
        "aws_secret_access_key": None,
        "aws_s3_bucket": None,
        "aws_audit_table": None,
        "commandos_payments_api_url": None,
        "commandos_payments_api_key": None,
        "commandos_payments_dataset_id": None,
    }
    values.update(overrides)
    return Config(**values)


def test_strict_failures_only_returns_required_non_live_results() -> None:
    results = [
        ProbeResult("livekit", "ok", True, True, "ready"),
        ProbeResult("sip", "blocked", False, False, "optional"),
        ProbeResult("moss", "blocked", False, True, "missing endpoint"),
    ]

    assert [result.name for result in strict_failures(results)] == ["moss"]


async def test_probe_env_reports_provider_presence_without_secret_values() -> None:
    result = await _probe_env(
        cfg(
            livekit_url="wss://example.livekit.cloud",
            livekit_api_key="lk-key",
            livekit_api_secret="lk-secret",
            moss_project_id="project",
            moss_project_key="key",
        ),
        required=False,
    )

    assert result.live is True
    assert result.metadata["livekit"] is True
    assert result.metadata["moss_credentials"] is True
    assert result.metadata["moss_sdk"] is True
    assert result.metadata["payment_telemetry"] is False
    assert "lk-key" not in str(result.to_dict())


async def test_commandos_flow_probe_fails_when_stub_events_remain() -> None:
    result = await _probe_commandos_flow(cfg(), required=True)

    assert result.live is False
    assert result.status == "failed"
    assert result.metadata["event_count"] == 40
    assert {event["type"] for event in result.metadata["stubbed_events"]} >= {
        "memory.recalled",
        "knowledge.retrieved",
        "guardrail.checked",
        "audit.saved",
    }


def test_minimal_pdf_bytes_is_pdf_like() -> None:
    payload = _minimal_pdf_bytes("CommandOS readiness")

    assert payload.startswith(b"%PDF-1.4")
    assert b"startxref" in payload
    assert payload.endswith(b"%%EOF\n")
