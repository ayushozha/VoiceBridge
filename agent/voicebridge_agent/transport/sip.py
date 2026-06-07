"""LiveKit SIP outbound calling for the phone-network demo path.

This is the real PSTN path: it asks LiveKit SIP to dial a phone number and join
that call as a participant in the same room the web console and agent use.
It requires a LiveKit outbound SIP trunk. Without that trunk, the command exits
with an explicit readiness error instead of pretending a phone call happened.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import re
from dataclasses import dataclass

from livekit import api

from voicebridge_agent.config import Config, load_config

logger = logging.getLogger("voicebridge.sip")

SIP_PARTICIPANT_IDENTITY = "phone_ayush_demo"


class SIPReadinessError(RuntimeError):
    """Raised when the local config or LiveKit project cannot place PSTN calls."""


@dataclass(frozen=True, slots=True)
class SIPReadiness:
    """Safe-to-log readiness result."""

    livekit_configured: bool
    configured_trunk_id: str | None
    available_trunk_count: int
    selected_trunk_id: str | None
    phone_configured: bool

    @property
    def ready(self) -> bool:
        return bool(self.livekit_configured and self.selected_trunk_id and self.phone_configured)


@dataclass(frozen=True, slots=True)
class OutboundCallResult:
    """Safe-to-log result returned after LiveKit creates a SIP participant."""

    participant_identity: str
    participant_id: str
    room_name: str
    sip_call_id: str
    trunk_id: str


def normalize_e164(raw: str) -> str:
    """Normalize a US demo number or E.164 value into E.164 format."""
    value = raw.strip()
    if not value:
        raise ValueError("phone number is empty")
    if value.startswith("+"):
        digits = "+" + re.sub(r"\D", "", value[1:])
    else:
        only_digits = re.sub(r"\D", "", value)
        if len(only_digits) == 10:
            digits = f"+1{only_digits}"
        elif len(only_digits) == 11 and only_digits.startswith("1"):
            digits = f"+{only_digits}"
        else:
            digits = f"+{only_digits}"

    if not re.fullmatch(r"\+[1-9]\d{7,14}", digits):
        raise ValueError("phone number must be E.164 or a 10-digit US number")
    return digits


def mask_phone(phone: str) -> str:
    """Return a phone suffix safe for logs."""
    digits = re.sub(r"\D", "", phone)
    suffix = digits[-4:] if len(digits) >= 4 else "????"
    return f"+***{suffix}"


async def list_outbound_trunks(cfg: Config) -> list[api.SIPOutboundTrunkInfo]:
    """List outbound trunks from LiveKit without logging trunk secrets."""
    if not cfg.has_livekit:
        raise SIPReadinessError("LiveKit credentials are missing.")

    client = api.LiveKitAPI(cfg.livekit_url, cfg.livekit_api_key, cfg.livekit_api_secret)
    try:
        response = await client.sip.list_outbound_trunk(api.ListSIPOutboundTrunkRequest())
        return list(response.items)
    finally:
        await client.aclose()


def choose_trunk_id(cfg: Config, trunks: list[api.SIPOutboundTrunkInfo]) -> str | None:
    """Use explicit trunk config, otherwise auto-select only when exactly one exists."""
    if cfg.sip_outbound_trunk_id:
        return cfg.sip_outbound_trunk_id
    if len(trunks) == 1:
        return trunks[0].sip_trunk_id
    return None


async def check_sip_readiness(cfg: Config | None = None) -> SIPReadiness:
    """Return whether a real outbound call can be placed right now."""
    cfg = cfg or load_config()
    trunks = await list_outbound_trunks(cfg) if cfg.has_livekit else []
    selected_trunk_id = choose_trunk_id(cfg, trunks)
    return SIPReadiness(
        livekit_configured=cfg.has_livekit,
        configured_trunk_id=cfg.sip_outbound_trunk_id,
        available_trunk_count=len(trunks),
        selected_trunk_id=selected_trunk_id,
        phone_configured=bool(cfg.demo_outbound_phone_number),
    )


async def place_outbound_call(
    cfg: Config | None = None,
    *,
    phone_number: str | None = None,
    wait_until_answered: bool = False,
) -> OutboundCallResult:
    """Dial the configured phone number into the VoiceBridge LiveKit room."""
    cfg = cfg or load_config()
    trunks = await list_outbound_trunks(cfg)
    trunk_id = choose_trunk_id(cfg, trunks)
    if not trunk_id:
        raise SIPReadinessError(
            "No LiveKit outbound SIP trunk is configured. Add "
            "LIVEKIT_SIP_OUTBOUND_TRUNK_ID or create exactly one outbound trunk."
        )

    raw_phone = phone_number or cfg.demo_outbound_phone_number
    if not raw_phone:
        raise SIPReadinessError("DEMO_OUTBOUND_PHONE_NUMBER is missing.")
    to_number = normalize_e164(raw_phone)

    client = api.LiveKitAPI(cfg.livekit_url, cfg.livekit_api_key, cfg.livekit_api_secret)
    try:
        participant = await client.sip.create_sip_participant(
            api.CreateSIPParticipantRequest(
                sip_trunk_id=trunk_id,
                sip_call_to=to_number,
                room_name=cfg.room_name,
                participant_identity=SIP_PARTICIPANT_IDENTITY,
                participant_name="Ayush phone",
                participant_metadata='{"role":"phone_demo_user"}',
                wait_until_answered=wait_until_answered,
                hide_phone_number=True,
            ),
            timeout=90 if wait_until_answered else 30,
        )
        return OutboundCallResult(
            participant_identity=participant.participant_identity,
            participant_id=participant.participant_id,
            room_name=participant.room_name,
            sip_call_id=participant.sip_call_id,
            trunk_id=trunk_id,
        )
    finally:
        await client.aclose()


def _print_readiness(readiness: SIPReadiness) -> None:
    print(f"livekit_configured={readiness.livekit_configured}")
    print(f"available_outbound_trunks={readiness.available_trunk_count}")
    print(f"configured_trunk_id={bool(readiness.configured_trunk_id)}")
    print(f"selected_trunk_id={bool(readiness.selected_trunk_id)}")
    print(f"phone_configured={readiness.phone_configured}")
    print(f"ready={readiness.ready}")
    if not readiness.ready:
        print(
            "blocked=configure a LiveKit outbound SIP trunk and set "
            "LIVEKIT_SIP_OUTBOUND_TRUNK_ID"
        )


async def _amain(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="VoiceBridge real outbound SIP call")
    parser.add_argument("command", choices=("check", "call"))
    parser.add_argument("--wait-until-answered", action="store_true")
    args = parser.parse_args(argv)

    if args.command == "check":
        _print_readiness(await check_sip_readiness())
        return 0

    cfg = load_config()
    target = cfg.demo_outbound_phone_number
    if target:
        print(f"dialing={mask_phone(target)} room={cfg.room_name}")
    result = await place_outbound_call(cfg, wait_until_answered=args.wait_until_answered)
    print(f"call_created=true room={result.room_name} participant={result.participant_identity}")
    print(f"sip_call_id={result.sip_call_id}")
    return 0


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    try:
        raise SystemExit(asyncio.run(_amain()))
    except SIPReadinessError as exc:
        print("call_created=false")
        print(f"error={exc}")
        raise SystemExit(2) from exc


if __name__ == "__main__":
    main()
