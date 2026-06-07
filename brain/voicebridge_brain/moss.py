"""Live Moss incident-memory adapter for CommandOS.

Moss is used as the real self-improving retrieval/writeback path for prior
incident memory. The local CommandOS memory remains useful for offline unit
tests, but live readiness and the judge demo should exercise this adapter.
"""

from __future__ import annotations

import asyncio
import inspect
import os
import re
import threading
from dataclasses import dataclass
from typing import Any

from voicebridge_contract import MemoryScope

DEFAULT_MEMORY_INDEX = "voicebridge_communication_memory"
DEFAULT_MODEL_ID = "moss-minilm"


@dataclass(frozen=True, slots=True)
class MossConfig:
    project_id: str
    project_key: str
    memory_index_name: str = DEFAULT_MEMORY_INDEX
    model_id: str = DEFAULT_MODEL_ID

    @classmethod
    def from_env(cls) -> MossConfig | None:
        project_id = _env_value("MOSS_PROJECT_ID")
        project_key = _env_value("MOSS_PROJECT_KEY")
        if not project_id or not project_key:
            return None
        return cls(
            project_id=project_id,
            project_key=project_key,
            memory_index_name=os.getenv("MOSS_MEMORY_INDEX_NAME", DEFAULT_MEMORY_INDEX),
            model_id=os.getenv("MOSS_MODEL_ID", DEFAULT_MODEL_ID),
        )


class MossIncidentMemoryAdapter:
    """Moss-backed equivalent of CommandOS's local incident memory adapter."""

    source = "moss"

    def __init__(self, config: MossConfig) -> None:
        self.config = config
        self._client: Any | None = None
        self._loaded = False

    @classmethod
    def from_env(cls) -> MossIncidentMemoryAdapter | None:
        config = MossConfig.from_env()
        return cls(config) if config else None

    @property
    def index_name(self) -> str:
        return self.config.memory_index_name

    def ensure_ready(self) -> dict[str, Any]:
        """Ensure the memory index exists, has seed docs, and is loaded."""

        client = self._moss_client()
        created = False
        try:
            info = _resolve_moss_call(client.get_index(self.index_name))
        except Exception:
            _resolve_moss_call(
                client.create_index(
                    self.index_name,
                    _seed_documents(),
                    model_id=self.config.model_id,
                )
            )
            created = True
        else:
            self._upsert_seed_documents()

        _resolve_moss_call(client.load_index(self.index_name))
        self._loaded = True
        info = _resolve_moss_call(client.get_index(self.index_name))
        return {
            "index_name": self.index_name,
            "created": created,
            "status": _attr_or_key(info, "status"),
            "doc_count": _attr_or_key(info, "doc_count", "docCount"),
            "model": _model_id(info),
        }

    def recall_similar_incident(self, query: str, region: str, system: str) -> dict[str, Any]:
        self.ensure_ready()
        from moss import QueryOptions

        results = _resolve_moss_call(
            self._moss_client().query(
                self.index_name,
                f"{query} region:{region} system:{system}",
                QueryOptions(top_k=1, alpha=0.8),
            )
        )
        docs = list(getattr(results, "docs", []) or [])
        if not docs:
            raise RuntimeError("Moss returned no prior incident documents.")

        doc = docs[0]
        metadata = dict(getattr(doc, "metadata", {}) or {})
        incident_id = _doc_id(doc)
        return {
            "source": "moss",
            "similarity": round(float(getattr(doc, "score", 0.0) or 0.0), 3),
            "incident_id": incident_id,
            "title": metadata.get("title", "Prior CommandOS incident"),
            "what_happened": metadata.get("what_happened", _doc_text(doc)),
            "bad_action": metadata.get("bad_action", "Unsafe action was blocked."),
            "successful_action": metadata.get(
                "successful_action",
                "Controlled mitigation succeeded.",
            ),
            "owner": metadata.get("owner", "payments_platform_on_call"),
            "frontend": {
                "scene": "prior_incident_overlay",
                "overlay": metadata.get("overlay", "moss_prior_incident_overlay"),
            },
            "provenance": {
                "store": "moss",
                "index": self.index_name,
                "document_id": incident_id,
                "region": metadata.get("region", region),
                "system": metadata.get("system", system),
                "tags": _split_tags(metadata.get("tags", "")),
            },
        }

    def remember_incident_learning(
        self,
        scope: MemoryScope,
        report: dict[str, Any],
    ) -> dict[str, Any]:
        self.ensure_ready()
        doc_id = _stable_id(
            "commandos_learning",
            scope.case_id,
            str(report.get("report_id") or report.get("title") or "report"),
        )
        doc = _document(
            doc_id,
            " ".join(
                [
                    str(report.get("title") or "CommandOS incident report"),
                    str(report.get("root_cause_hypothesis") or ""),
                    " ".join(str(item) for item in report.get("recommended_mitigation", [])),
                    str(report.get("customer_update") or ""),
                ]
            ).strip(),
            {
                "type": "incident_learning",
                "tenant_id": scope.tenant_id,
                "user_id": scope.user_id,
                "case_id": scope.case_id,
                "report_id": str(report.get("report_id") or ""),
                "title": str(report.get("title") or ""),
                "region": "Texas",
                "system": "payment_gateway",
                "tags": "texas,payments,gateway,incident,learning",
            },
        )
        from moss import MutationOptions

        result = _resolve_moss_call(
            self._moss_client().add_docs(
                self.index_name,
                [doc],
                MutationOptions(upsert=True),
            )
        )
        self._loaded = False
        return {
            "source": "moss",
            "provider": "moss",
            "integration_mode": "live",
            "event": "incident.learning_saved",
            "before": {"index_name": self.index_name},
            "after": {
                "tenant_id": scope.tenant_id,
                "user_id": scope.user_id,
                "case_id": scope.case_id,
                "latest_report_id": report.get("report_id"),
                "document_id": doc_id,
                "job_id": _attr_or_key(result, "job_id", "jobId"),
                "doc_count": _attr_or_key(result, "doc_count", "docCount"),
                "index_name": _attr_or_key(result, "index_name", "indexName") or self.index_name,
            },
        }

    def _moss_client(self) -> Any:
        if self._client is None:
            from moss import MossClient

            self._client = MossClient(self.config.project_id, self.config.project_key)
        return self._client

    def _upsert_seed_documents(self) -> None:
        from moss import MutationOptions

        _resolve_moss_call(
            self._moss_client().add_docs(
                self.index_name,
                _seed_documents(),
                MutationOptions(upsert=True),
            )
        )
        self._loaded = False


def _seed_documents() -> list[Any]:
    return [
        _document(
            "commandos_prior_may_2026_texas_gateway_saturation",
            (
                "Texas payment failures spiked after gateway queues backed up. "
                "A gateway restart before queue-depth checks increased duplicate-charge "
                "risk. The successful path shifted traffic to the secondary gateway, "
                "then requested controlled restart approval."
            ),
            {
                "type": "prior_incident",
                "title": "Texas gateway saturation",
                "region": "Texas",
                "system": "payment_gateway",
                "what_happened": "Texas payment failures spiked after gateway queues backed up.",
                "bad_action": (
                    "Gateway restart before queue-depth check increased duplicate-charge risk."
                ),
                "successful_action": (
                    "Traffic shifted to secondary gateway, then a controlled restart was approved."
                ),
                "owner": "payments_platform_on_call",
                "overlay": "ghost_texas_gateway_spike",
                "tags": "texas,payments,payment,failing,gateway,queue,premium",
            },
        )
    ]


def _document(id: str, text: str, metadata: dict[str, str]) -> Any:
    from moss import DocumentInfo

    clean_metadata = {key: str(value) for key, value in metadata.items()}
    return DocumentInfo(id=id, text=text, metadata=clean_metadata)


def _stable_id(*parts: str) -> str:
    raw = "::".join(parts).lower()
    return re.sub(r"[^a-z0-9_]+", "_", raw).strip("_")[:180]


def _env_value(name: str) -> str | None:
    value = os.getenv(name)
    if not value:
        return None
    value = value.strip()
    if not value or (value.startswith("<") and value.endswith(">")):
        return None
    return value


def _attr_or_key(value: Any, *names: str) -> Any:
    for name in names:
        if hasattr(value, name):
            return getattr(value, name)
        if isinstance(value, dict) and name in value:
            return value[name]
    return None


def _model_id(info: Any) -> str | None:
    model = _attr_or_key(info, "model")
    if model is None:
        return None
    return _attr_or_key(model, "id") or str(model)


def _doc_id(doc: Any) -> str:
    return str(_attr_or_key(doc, "id") or "moss_document")


def _doc_text(doc: Any) -> str:
    return str(_attr_or_key(doc, "text") or "")


def _split_tags(value: str) -> list[str]:
    return [tag for tag in (part.strip() for part in value.split(",")) if tag]


def _resolve_moss_call(value: Any) -> Any:
    if not inspect.isawaitable(value):
        return value

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(value)

    result: list[Any] = []
    errors: list[BaseException] = []

    def _runner() -> None:
        try:
            result.append(asyncio.run(value))
        except BaseException as exc:  # noqa: BLE001 - preserves SDK exception
            errors.append(exc)

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    thread.join()
    if errors:
        raise errors[0]
    return result[0] if result else None


__all__ = ["MossConfig", "MossIncidentMemoryAdapter"]
