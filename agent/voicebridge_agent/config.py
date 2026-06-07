"""Environment + integration-mode resolution for the CommandOS agent.

Loads the repo-root ``.env`` and reports which sponsor integrations are live vs
stubbed, so the runtime trace can show the truth (per spec § Sponsor Integration
Bar). A value is considered "missing" if it is empty or a ``<placeholder>``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Repo root is two levels up from this file: agent/voicebridge_agent/config.py
REPO_ROOT = Path(__file__).resolve().parents[2]

# Load root .env first (shared), then an optional agent-local override.
load_dotenv(REPO_ROOT / ".env")
load_dotenv(REPO_ROOT / "agent" / ".env.local", override=True)


def _val(name: str) -> str | None:
    """Return a real value or None if empty/placeholder (<...>)."""
    v = os.getenv(name)
    if not v:
        return None
    v = v.strip()
    if not v or (v.startswith("<") and v.endswith(">")):
        return None
    return v


def _present(name: str) -> bool:
    return _val(name) is not None


@dataclass(frozen=True)
class Config:
    # Demo scope
    tenant_id: str
    user_id: str
    case_id: str

    # LiveKit
    livekit_url: str | None
    livekit_api_key: str | None
    livekit_api_secret: str | None
    room_name: str
    sip_outbound_trunk_id: str | None
    demo_outbound_phone_number: str | None

    # Voice providers
    elevenlabs_api_key: str | None
    elevenlabs_voice_id: str | None
    minimax_api_key: str | None
    minimax_group_id: str | None
    minimax_model: str

    # LLM / multilingual (OpenAI-compatible endpoints)
    qwen_base_url: str | None
    qwen_api_key: str | None  # DASHSCOPE_API_KEY
    qwen_model: str
    nvidia_api_key: str | None
    model_fallback_api_key: str | None
    model_fallback_base_url: str
    model_fallback_text_model: str
    model_fallback_realtime_model: str
    model_fallback_translation_model: str

    # Sponsor memory, docs, governance, and audit paths
    moss_project_id: str | None
    moss_project_key: str | None
    moss_index_name: str
    moss_memory_index_name: str
    moss_model_id: str
    unsiloed_api_key: str | None
    unsiloed_parse_url: str | None
    exa_api_key: str | None
    truefoundry_api_key: str | None
    truefoundry_gateway_base_url: str | None
    truefoundry_guardrail_config_id: str | None
    truefoundry_model: str | None
    aws_region: str
    aws_access_key_id: str | None
    aws_secret_access_key: str | None
    aws_s3_bucket: str | None
    aws_audit_table: str | None
    commandos_payments_api_url: str | None
    commandos_payments_api_key: str | None
    commandos_payments_dataset_id: str | None

    @property
    def has_livekit(self) -> bool:
        return bool(self.livekit_url and self.livekit_api_key and self.livekit_api_secret)

    @property
    def has_sip_outbound(self) -> bool:
        return bool(self.has_livekit and self.sip_outbound_trunk_id)

    @property
    def has_elevenlabs(self) -> bool:
        return bool(self.elevenlabs_api_key and self.elevenlabs_voice_id)

    @property
    def has_minimax(self) -> bool:
        return bool(self.minimax_api_key)

    @property
    def has_qwen(self) -> bool:
        return bool(self.qwen_api_key and self.qwen_base_url)

    @property
    def has_nvidia(self) -> bool:
        return bool(self.nvidia_api_key)

    @property
    def has_model_fallback(self) -> bool:
        return bool(self.model_fallback_api_key)

    @property
    def has_moss_credentials(self) -> bool:
        return bool(self.moss_project_id and self.moss_project_key)

    @property
    def has_moss_live(self) -> bool:
        return self.has_moss_credentials

    @property
    def has_unsiloed(self) -> bool:
        return bool(self.unsiloed_api_key and self.unsiloed_parse_url)

    @property
    def has_exa(self) -> bool:
        return bool(self.exa_api_key)

    @property
    def has_truefoundry(self) -> bool:
        return bool(self.truefoundry_api_key and self.truefoundry_gateway_base_url)

    @property
    def has_aws(self) -> bool:
        return bool(self.aws_access_key_id and self.aws_secret_access_key)

    @property
    def has_payment_telemetry(self) -> bool:
        return bool(self.commandos_payments_api_url)


def load_config() -> Config:
    return Config(
        tenant_id=os.getenv("DEMO_TENANT_ID", "atlaspay"),
        user_id=os.getenv("DEMO_USER_ID", "ayush_demo"),
        case_id=os.getenv("DEMO_CASE_ID", "sev1_tx_payments_2026_06_07"),
        livekit_url=_val("LIVEKIT_URL"),
        livekit_api_key=_val("LIVEKIT_API_KEY"),
        livekit_api_secret=_val("LIVEKIT_API_SECRET"),
        room_name=os.getenv("COMMANDOS_ROOM", os.getenv("VOICEBRIDGE_ROOM", "commandos-demo")),
        sip_outbound_trunk_id=_val("LIVEKIT_SIP_OUTBOUND_TRUNK_ID"),
        demo_outbound_phone_number=_val("DEMO_OUTBOUND_PHONE_NUMBER"),
        elevenlabs_api_key=_val("ELEVENLABS_API_KEY"),
        elevenlabs_voice_id=_val("ELEVENLABS_VOICE_ID"),
        minimax_api_key=_val("MINIMAX_API_KEY"),
        minimax_group_id=_val("MINIMAX_GROUP_ID"),
        minimax_model=os.getenv("MINIMAX_TTS_MODEL", "speech-2.8-hd"),
        qwen_base_url=_val("QWEN_BASE_URL"),
        qwen_api_key=_val("DASHSCOPE_API_KEY"),
        qwen_model=os.getenv("QWEN_MODEL", "qwen-plus"),
        nvidia_api_key=_val("NVIDIA_NEMOTRON_VOICECHAT_API_KEY"),
        model_fallback_api_key=_val("COMMANDOS_MODEL_FALLBACK_API_KEY"),
        model_fallback_base_url=os.getenv(
            "COMMANDOS_MODEL_FALLBACK_BASE_URL",
            "https://api.openai.com/v1",
        ),
        model_fallback_text_model=os.getenv("COMMANDOS_MODEL_FALLBACK_TEXT_MODEL", "gpt-5.5"),
        model_fallback_realtime_model=os.getenv(
            "COMMANDOS_MODEL_FALLBACK_REALTIME_MODEL",
            "gpt-realtime-2",
        ),
        model_fallback_translation_model=os.getenv(
            "COMMANDOS_MODEL_FALLBACK_TRANSLATION_MODEL",
            "gpt-realtime-translate",
        ),
        moss_project_id=_val("MOSS_PROJECT_ID"),
        moss_project_key=_val("MOSS_PROJECT_KEY"),
        moss_index_name=os.getenv("MOSS_INDEX_NAME", "voicebridge_business_knowledge"),
        moss_memory_index_name=os.getenv(
            "MOSS_MEMORY_INDEX_NAME",
            "voicebridge_communication_memory",
        ),
        moss_model_id=os.getenv("MOSS_MODEL_ID", "moss-minilm"),
        unsiloed_api_key=_val("UNSILOED_API_KEY"),
        unsiloed_parse_url=_val("UNSILOED_PARSE_URL"),
        exa_api_key=_val("EXA_API_KEY"),
        truefoundry_api_key=_val("TRUEFOUNDRY_API_KEY"),
        truefoundry_gateway_base_url=_val("TRUEFOUNDRY_GATEWAY_BASE_URL"),
        truefoundry_guardrail_config_id=_val("TRUEFOUNDRY_GUARDRAIL_CONFIG_ID"),
        truefoundry_model=_val("TRUEFOUNDRY_MODEL"),
        aws_region=os.getenv("AWS_REGION", "us-west-2"),
        aws_access_key_id=_val("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=_val("AWS_SECRET_ACCESS_KEY"),
        aws_s3_bucket=_val("AWS_S3_BUCKET"),
        aws_audit_table=_val("AWS_AUDIT_TABLE"),
        commandos_payments_api_url=_val("COMMANDOS_PAYMENTS_API_URL"),
        commandos_payments_api_key=_val("COMMANDOS_PAYMENTS_API_KEY"),
        commandos_payments_dataset_id=_val("COMMANDOS_PAYMENTS_DATASET_ID"),
    )
