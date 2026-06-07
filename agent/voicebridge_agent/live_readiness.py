"""Live demo readiness probes.

This module is intentionally stricter than ``agent smoke``. Smoke proves imports
and local contracts. Live readiness proves that the configured demo path can call
real providers, and it fails when the CommandOS event stream still contains a
fixture-backed integration claim.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

import aiohttp

from voicebridge_agent.agent import NVIDIA_NEMOTRON_MODEL, NVIDIA_OPENAI_BASE_URL
from voicebridge_agent.config import Config, load_config
from voicebridge_agent.transport.sip import check_sip_readiness
from voicebridge_agent.voice.elevenlabs import ElevenLabsAdapter
from voicebridge_agent.voice.minimax import MiniMaxAdapter

ProbeStatus = Literal["ok", "blocked", "failed"]

_REQUIRED_PROBES = {
    "livekit",
    "elevenlabs",
    "minimax",
    "nvidia",
    "qwen",
    "unsiloed",
    "moss",
    "truefoundry",
    "aws",
    "payment_telemetry",
    "commandos_flow",
}


@dataclass(frozen=True, slots=True)
class ProbeResult:
    """One safe-to-print provider probe result."""

    name: str
    status: ProbeStatus
    live: bool
    required: bool
    detail: str
    latency_ms: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        if self.latency_ms is None:
            payload.pop("latency_ms")
        return payload


async def run_live_readiness(
    cfg: Config | None = None,
    *,
    required: set[str] | None = None,
) -> list[ProbeResult]:
    """Run all provider probes against the current environment."""

    cfg = cfg or load_config()
    required = required or set(_REQUIRED_PROBES)
    probes: list[tuple[str, Callable[[Config, bool], Awaitable[ProbeResult]]]] = [
        ("env", _probe_env),
        ("livekit", _probe_livekit),
        ("sip", _probe_sip),
        ("elevenlabs", _probe_elevenlabs),
        ("minimax", _probe_minimax),
        ("nvidia", _probe_nvidia),
        ("qwen", _probe_qwen),
        ("unsiloed", _probe_unsiloed),
        ("moss", _probe_moss),
        ("truefoundry", _probe_truefoundry),
        ("aws", _probe_aws),
        ("payment_telemetry", _probe_payment_telemetry),
        ("commandos_flow", _probe_commandos_flow),
    ]
    results: list[ProbeResult] = []
    for name, probe in probes:
        results.append(await probe(cfg, name in required))
    return results


def strict_failures(results: Sequence[ProbeResult]) -> list[ProbeResult]:
    """Return required probes that are not live and ok."""

    return [result for result in results if result.required and not result.live]


async def _timed(
    name: str,
    required: bool,
    action: Callable[[], Awaitable[ProbeResult]],
) -> ProbeResult:
    start = time.perf_counter()
    try:
        result = await action()
    except Exception as exc:  # noqa: BLE001 - readiness must report every provider
        return ProbeResult(
            name=name,
            status="failed",
            live=False,
            required=required,
            detail=f"{type(exc).__name__}: {exc}",
            latency_ms=round((time.perf_counter() - start) * 1000.0, 1),
        )
    if result.latency_ms is not None:
        return result
    return ProbeResult(
        name=result.name,
        status=result.status,
        live=result.live,
        required=result.required,
        detail=result.detail,
        latency_ms=round((time.perf_counter() - start) * 1000.0, 1),
        metadata=result.metadata,
    )


async def _probe_env(cfg: Config, required: bool) -> ProbeResult:
    configured = {
        "livekit": cfg.has_livekit,
        "sip_outbound": cfg.has_sip_outbound,
        "elevenlabs": cfg.has_elevenlabs,
        "minimax": cfg.has_minimax,
        "nvidia": cfg.has_nvidia,
        "qwen": cfg.has_qwen,
        "moss_credentials": cfg.has_moss_credentials,
        "moss_live_endpoint": cfg.has_moss_live,
        "unsiloed": cfg.has_unsiloed,
        "truefoundry": cfg.has_truefoundry,
        "aws": cfg.has_aws,
        "payment_telemetry": cfg.has_payment_telemetry,
    }
    return ProbeResult(
        name="env",
        status="ok",
        live=True,
        required=required,
        detail="Loaded repo-root .env and resolved provider presence.",
        metadata=configured,
    )


async def _probe_livekit(cfg: Config, required: bool) -> ProbeResult:
    if not cfg.has_livekit:
        return _blocked("livekit", required, "Missing LIVEKIT_URL/API_KEY/API_SECRET.")

    async def _run() -> ProbeResult:
        from livekit import api

        client = api.LiveKitAPI(cfg.livekit_url, cfg.livekit_api_key, cfg.livekit_api_secret)
        try:
            response = await client.room.list_rooms(api.ListRoomsRequest())
        finally:
            await client.aclose()
        return ProbeResult(
            name="livekit",
            status="ok",
            live=True,
            required=required,
            detail="Listed rooms with LiveKit Cloud API.",
            metadata={"room_count": len(response.rooms)},
        )

    return await _timed("livekit", required, _run)


async def _probe_sip(cfg: Config, required: bool) -> ProbeResult:
    if not cfg.has_livekit:
        return _blocked("sip", required, "LiveKit is not configured.")

    async def _run() -> ProbeResult:
        readiness = await check_sip_readiness(cfg)
        status: ProbeStatus = "ok" if readiness.ready else "blocked"
        return ProbeResult(
            name="sip",
            status=status,
            live=readiness.ready,
            required=required,
            detail=(
                "Outbound SIP trunk is ready."
                if readiness.ready
                else "No real outbound phone path; configure LIVEKIT_SIP_OUTBOUND_TRUNK_ID."
            ),
            metadata={
                "available_outbound_trunks": readiness.available_trunk_count,
                "configured_trunk_id": bool(readiness.configured_trunk_id),
                "selected_trunk_id": bool(readiness.selected_trunk_id),
                "phone_configured": readiness.phone_configured,
            },
        )

    return await _timed("sip", required, _run)


async def _probe_elevenlabs(cfg: Config, required: bool) -> ProbeResult:
    if not cfg.has_elevenlabs:
        return _blocked("elevenlabs", required, "Missing ELEVENLABS_API_KEY or VOICE_ID.")

    async def _run() -> ProbeResult:
        result = await asyncio.wait_for(
            ElevenLabsAdapter(cfg).synthesize("CommandOS live check.", language="en"),
            timeout=30,
        )
        return ProbeResult(
            name="elevenlabs",
            status="ok",
            live=bool(result.audio),
            required=required,
            detail="Synthesized real PCM audio through ElevenLabs.",
            metadata={
                "provider": result.provider,
                "audio_bytes": len(result.audio),
                "first_audio_latency_ms": result.latency_ms,
            },
        )

    return await _timed("elevenlabs", required, _run)


async def _probe_minimax(cfg: Config, required: bool) -> ProbeResult:
    if not cfg.has_minimax:
        return _blocked("minimax", required, "Missing MINIMAX_API_KEY.")

    async def _run() -> ProbeResult:
        result = await asyncio.wait_for(
            MiniMaxAdapter(cfg).synthesize("CommandOS live check.", language="en"),
            timeout=45,
        )
        return ProbeResult(
            name="minimax",
            status="ok",
            live=bool(result.audio),
            required=required,
            detail="Synthesized real PCM audio through MiniMax.",
            metadata={
                "provider": result.provider,
                "model": cfg.minimax_model,
                "audio_bytes": len(result.audio),
                "first_audio_latency_ms": result.latency_ms,
            },
        )

    return await _timed("minimax", required, _run)


async def _probe_nvidia(cfg: Config, required: bool) -> ProbeResult:
    if not cfg.has_nvidia:
        return _blocked("nvidia", required, "Missing NVIDIA_NEMOTRON_VOICECHAT_API_KEY.")
    return await _probe_openai_compatible(
        name="nvidia",
        required=required,
        base_url=NVIDIA_OPENAI_BASE_URL,
        api_key=cfg.nvidia_api_key or "",
        model=NVIDIA_NEMOTRON_MODEL,
        detail="Completed a real NVIDIA Nemotron chat completion.",
    )


async def _probe_qwen(cfg: Config, required: bool) -> ProbeResult:
    if not cfg.has_qwen:
        return _blocked("qwen", required, "Missing DASHSCOPE_API_KEY or QWEN_BASE_URL.")
    return await _probe_openai_compatible(
        name="qwen",
        required=required,
        base_url=cfg.qwen_base_url or "",
        api_key=cfg.qwen_api_key or "",
        model=cfg.qwen_model,
        detail="Completed a real Qwen/DashScope chat completion.",
    )


async def _probe_openai_compatible(
    *,
    name: str,
    required: bool,
    base_url: str,
    api_key: str,
    model: str,
    detail: str,
    extra_headers: dict[str, str] | None = None,
) -> ProbeResult:
    async def _run() -> ProbeResult:
        url = base_url.rstrip("/") + "/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if extra_headers:
            headers.update(extra_headers)
        body = {
            "model": model,
            "messages": [{"role": "user", "content": "Reply with exactly: live"}],
            "temperature": 0,
            "max_tokens": 4,
        }
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=45)) as session:
            async with session.post(url, headers=headers, json=body) as resp:
                text = await resp.text()
                if resp.status >= 400:
                    raise RuntimeError(_http_error(resp.status, text))
                payload = json.loads(text)
        content = (
            payload.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )
        return ProbeResult(
            name=name,
            status="ok",
            live=True,
            required=required,
            detail=detail,
            metadata={"model": model, "reply": content[:40]},
        )

    return await _timed(name, required, _run)


async def _probe_unsiloed(cfg: Config, required: bool) -> ProbeResult:
    if not cfg.has_unsiloed:
        return _blocked("unsiloed", required, "Missing UNSILOED_API_KEY or PARSE_URL.")

    async def _run() -> ProbeResult:
        form = aiohttp.FormData()
        form.add_field(
            "file",
            _minimal_pdf_bytes("CommandOS live payment outage runbook."),
            filename="commandos-live-check.pdf",
            content_type="application/pdf",
        )
        form.add_field("use_high_resolution", "false")
        form.add_field("layout_analysis", "page_by_page")
        form.add_field("ocr_strategy", "auto_detection")
        form.add_field("merge_tables", "false")
        form.add_field("segment_filter", "text")
        form.add_field(
            "output_fields",
            json.dumps(
                {
                    "html": False,
                    "markdown": True,
                    "ocr": False,
                    "image": False,
                    "content": True,
                    "bbox": False,
                    "confidence": False,
                }
            ),
        )
        headers = {"api-key": cfg.unsiloed_api_key or "", "accept": "application/json"}
        parse_url = cfg.unsiloed_parse_url or ""
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=150)) as session:
            async with session.post(parse_url, data=form, headers=headers) as resp:
                create_text = await resp.text()
                if resp.status >= 400:
                    raise RuntimeError(_http_error(resp.status, create_text))
                created = json.loads(create_text)
            job_id = str(created.get("job_id") or "")
            if not job_id:
                raise RuntimeError("UnSiloed response did not include job_id.")

            result_url = parse_url.rstrip("/") + f"/{job_id}"
            status = str(created.get("status") or "Starting")
            final_payload: dict[str, Any] = created
            for _ in range(30):
                if status.lower() in {"succeeded", "failed"}:
                    break
                await asyncio.sleep(3)
                async with session.get(result_url, headers=headers) as poll_resp:
                    poll_text = await poll_resp.text()
                    if poll_resp.status >= 400:
                        raise RuntimeError(_http_error(poll_resp.status, poll_text))
                    final_payload = json.loads(poll_text)
                    status = str(final_payload.get("status") or status)
            if status.lower() != "succeeded":
                raise RuntimeError(f"UnSiloed parse did not succeed; final status={status}")

        return ProbeResult(
            name="unsiloed",
            status="ok",
            live=True,
            required=required,
            detail="Uploaded and parsed a real PDF through UnSiloed.",
            metadata={
                "job_id": job_id,
                "status": status,
                "credit_used": final_payload.get("credit_used", created.get("credit_used")),
                "quota_remaining": final_payload.get(
                    "quota_remaining",
                    created.get("quota_remaining"),
                ),
            },
        )

    return await _timed("unsiloed", required, _run)


async def _probe_moss(cfg: Config, required: bool) -> ProbeResult:
    if not cfg.has_moss_credentials:
        return _blocked("moss", required, "Missing MOSS_PROJECT_ID or MOSS_PROJECT_KEY.")
    if not cfg.moss_api_base_url:
        return _blocked(
            "moss",
            required,
            "MOSS credentials are present, but no MOSS_API_BASE_URL/API docs are configured.",
            metadata={
                "project_id_present": True,
                "project_key_present": True,
                "memory_index": cfg.moss_memory_index_name,
                "knowledge_index": cfg.moss_index_name,
            },
        )

    async def _run() -> ProbeResult:
        url = cfg.moss_api_base_url.rstrip("/") + "/health"
        headers = {
            "Authorization": f"Bearer {cfg.moss_project_key}",
            "X-MOSS-Project-ID": cfg.moss_project_id or "",
        }
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
            async with session.get(url, headers=headers) as resp:
                text = await resp.text()
                if resp.status >= 400:
                    raise RuntimeError(_http_error(resp.status, text))
        return ProbeResult(
            name="moss",
            status="ok",
            live=True,
            required=required,
            detail="MOSS health endpoint responded.",
            metadata={
                "project_id_present": True,
                "memory_index": cfg.moss_memory_index_name,
                "knowledge_index": cfg.moss_index_name,
            },
        )

    return await _timed("moss", required, _run)


async def _probe_truefoundry(cfg: Config, required: bool) -> ProbeResult:
    if not cfg.has_truefoundry:
        return _blocked(
            "truefoundry",
            required,
            "Missing TRUEFOUNDRY_API_KEY or TRUEFOUNDRY_GATEWAY_BASE_URL.",
        )
    if not cfg.truefoundry_model:
        return _blocked(
            "truefoundry",
            required,
            "Missing TRUEFOUNDRY_MODEL for the AI Gateway chat completion probe.",
        )
    headers: dict[str, str] = {}
    if cfg.truefoundry_guardrail_config_id:
        headers["X-TFY-GUARDRAILS"] = json.dumps(
            {"llm_input_guardrails": [cfg.truefoundry_guardrail_config_id]}
        )
        headers["X-TFY-GUARDRAILS-SCOPE"] = "last"
    return await _probe_openai_compatible(
        name="truefoundry",
        required=required,
        base_url=cfg.truefoundry_gateway_base_url or "",
        api_key=cfg.truefoundry_api_key or "",
        model=cfg.truefoundry_model,
        detail="Completed a real TrueFoundry AI Gateway guarded chat completion.",
        extra_headers=headers,
    )


async def _probe_aws(cfg: Config, required: bool) -> ProbeResult:
    if not cfg.has_aws:
        return _blocked("aws", required, "Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY.")

    async def _run() -> ProbeResult:
        import boto3
        from botocore.config import Config as BotoConfig

        def _call() -> dict[str, Any]:
            session = boto3.Session(
                aws_access_key_id=cfg.aws_access_key_id,
                aws_secret_access_key=cfg.aws_secret_access_key,
                region_name=cfg.aws_region,
            )
            sts = session.client("sts", config=BotoConfig(retries={"max_attempts": 1}))
            identity = sts.get_caller_identity()
            return {
                "account_present": bool(identity.get("Account")),
                "arn_present": bool(identity.get("Arn")),
                "region": cfg.aws_region,
                "audit_table": cfg.aws_audit_table,
                "s3_bucket_configured": bool(cfg.aws_s3_bucket),
            }

        metadata = await asyncio.to_thread(_call)
        return ProbeResult(
            name="aws",
            status="ok",
            live=True,
            required=required,
            detail="Called AWS STS GetCallerIdentity with configured credentials.",
            metadata=metadata,
        )

    return await _timed("aws", required, _run)


async def _probe_payment_telemetry(cfg: Config, required: bool) -> ProbeResult:
    if not cfg.has_payment_telemetry:
        return _blocked(
            "payment_telemetry",
            required,
            "Missing COMMANDOS_PAYMENTS_API_URL for real recent payment failures.",
        )

    async def _run() -> ProbeResult:
        headers = {"accept": "application/json"}
        if cfg.commandos_payments_api_key:
            headers["Authorization"] = f"Bearer {cfg.commandos_payments_api_key}"
        params = {
            "region": "Texas",
            "window_minutes": "60",
            "customer_segment": "premium",
        }
        if cfg.commandos_payments_dataset_id:
            params["dataset_id"] = cfg.commandos_payments_dataset_id
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
            async with session.get(
                cfg.commandos_payments_api_url or "",
                headers=headers,
                params=params,
            ) as resp:
                text = await resp.text()
                if resp.status >= 400:
                    raise RuntimeError(_http_error(resp.status, text))
                payload = json.loads(text)
        hotspots = payload.get("hotspots") or payload.get("failures") or []
        if not isinstance(hotspots, list) or not hotspots:
            raise RuntimeError(
                "Telemetry endpoint must return a non-empty hotspots or failures array."
            )
        return ProbeResult(
            name="payment_telemetry",
            status="ok",
            live=True,
            required=required,
            detail="Fetched real recent payment-failure telemetry.",
            metadata={
                "hotspot_count": len(hotspots),
                "dataset_id_present": bool(cfg.commandos_payments_dataset_id),
            },
        )

    return await _timed("payment_telemetry", required, _run)


async def _probe_commandos_flow(cfg: Config, required: bool) -> ProbeResult:
    from voicebridge_brain.commandos import CommandOSOrchestrator
    from voicebridge_contract import MemoryScope

    scope = MemoryScope(
        tenant_id=cfg.tenant_id,
        user_id=cfg.user_id,
        case_id=cfg.case_id,
    )
    events = CommandOSOrchestrator().run(scope=scope)
    stubbed = [
        {
            "sequence": event.sequence,
            "type": event.type,
            "provider": event.payload.get("provider"),
            "source": event.payload.get("source"),
            "store": event.payload.get("store"),
        }
        for event in events
        if event.payload.get("integration_mode") == "stub"
        or event.payload.get("source") == "local"
        or event.payload.get("store") == "local"
        or event.payload.get("enforced_by") == "local"
    ]
    if stubbed:
        return ProbeResult(
            name="commandos_flow",
            status="failed",
            live=False,
            required=required,
            detail="CommandOS event stream still contains fixture/local-backed integration events.",
            metadata={"event_count": len(events), "stubbed_events": stubbed},
        )
    return ProbeResult(
        name="commandos_flow",
        status="ok",
        live=True,
        required=required,
        detail="CommandOS event stream has no stub/local integration payloads.",
        metadata={"event_count": len(events)},
    )


def _blocked(
    name: str,
    required: bool,
    detail: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> ProbeResult:
    return ProbeResult(
        name=name,
        status="blocked",
        live=False,
        required=required,
        detail=detail,
        metadata=metadata or {},
    )


def _http_error(status: int, text: str) -> str:
    sanitized = text.replace("\n", " ").strip()
    if len(sanitized) > 500:
        sanitized = sanitized[:500] + "..."
    return f"HTTP {status}: {sanitized}"


def _minimal_pdf_bytes(text: str) -> bytes:
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        (
            b"<< /Length "
            + str(len(stream)).encode("ascii")
            + b" >>\nstream\n"
            + stream
            + b"\nendstream"
        ),
    ]
    chunks = [b"%PDF-1.4\n"]
    offsets = [0]
    for index, body in enumerate(objects, start=1):
        offsets.append(sum(len(chunk) for chunk in chunks))
        chunks.append(f"{index} 0 obj\n".encode("ascii") + body + b"\nendobj\n")
    xref_offset = sum(len(chunk) for chunk in chunks)
    xref = [b"xref\n0 6\n0000000000 65535 f \n"]
    xref.extend(f"{offset:010d} 00000 n \n".encode("ascii") for offset in offsets[1:])
    chunks.extend(
        xref
        + [
            b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n",
            str(xref_offset).encode("ascii"),
            b"\n%%EOF\n",
        ]
    )
    return b"".join(chunks)


def _format_text(results: Sequence[ProbeResult]) -> str:
    lines = ["Live demo readiness:"]
    for result in results:
        marker = "OK" if result.live else result.status.upper()
        required = "required" if result.required else "optional"
        latency = f" ({result.latency_ms} ms)" if result.latency_ms is not None else ""
        lines.append(f"- {result.name}: {marker} [{required}]{latency} - {result.detail}")
        if result.metadata:
            lines.append(f"  metadata={json.dumps(result.metadata, sort_keys=True)}")
    failures = strict_failures(results)
    if failures:
        lines.append("strict_ready=false")
        lines.append("blocking=" + ", ".join(result.name for result in failures))
    else:
        lines.append("strict_ready=true")
    return "\n".join(lines)


async def _amain(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="CommandOS live demo readiness check")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero if any required probe is not live.",
    )
    args = parser.parse_args(argv)

    results = await run_live_readiness()
    if args.json:
        print(json.dumps([result.to_dict() for result in results], indent=2, sort_keys=True))
    else:
        print(_format_text(results))
    return 1 if args.strict and strict_failures(results) else 0


def main() -> None:
    raise SystemExit(asyncio.run(_amain()))


if __name__ == "__main__":
    main()
